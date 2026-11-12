const SUPABASE_URL = process.env.SUPABASE_URL || process.env.URL_SUPABASE;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRODUCT_ID = "prod_Vc0BNHjf8Ea6X";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método não permitido." });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return send(res, 500, { error: "A integração ainda não está totalmente configurada no ambiente Preview." });
  }
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return send(res, 401, { error: "Inicie sessão para continuar." });
  try {
    const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth }
    });
    if (!userResponse.ok) return send(res, 401, { error: "Sessão inválida. Entre novamente." });
    const user = await userResponse.json();

    const query = new URLSearchParams({
      select: "id,user_id,status,business_name,professional_email,payment_status,stripe_subscription_id",
      user_id: "eq." + user.id,
      status: "eq.approved",
      order: "created_at.desc",
      limit: "1"
    });
    const requestResponse = await fetch(SUPABASE_URL + "/rest/v1/kumprall_verification_requests?" + query, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY }
    });
    if (!requestResponse.ok) throw new Error("Não foi possível consultar a candidatura aprovada.");
    const requests = await requestResponse.json();
    const application = requests[0];
    if (!application) return send(res, 403, { error: "A candidatura profissional ainda não foi aprovada." });
    if (application.payment_status === "paid") return send(res, 409, { error: "Esta certificação já tem um pagamento confirmado." });
    if (application.stripe_subscription_id) return send(res, 409, { error: "Já existe uma subscrição associada a esta candidatura. Contacte o apoio." });

    const pricesResponse = await fetch("https://api.stripe.com/v1/prices?product=" + encodeURIComponent(STRIPE_PRODUCT_ID) + "&active=true&limit=100", {
      headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY }
    });
    if (!pricesResponse.ok) throw new Error("Não foi possível consultar o preço da certificação na Stripe.");
    const prices = await pricesResponse.json();
    const price = (prices.data || []).find(p => p.currency === "eur" && p.unit_amount === 10000 && p.recurring && p.recurring.interval === "year");
    if (!price) return send(res, 500, { error: "Não foi encontrado o preço recorrente anual de 100 € na Stripe." });

    const origin = req.headers.origin && /^https:\/\/[a-z0-9.-]+\.vercel\.app$/i.test(req.headers.origin)
      ? req.headers.origin : "https://kumprall.vercel.app";
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("success_url", origin + "/?certification=success&session_id={CHECKOUT_SESSION_ID}");
    params.set("cancel_url", origin + "/?certification=cancelled");
    params.set("client_reference_id", application.id);
    params.set("customer_email", application.professional_email || user.email || "");
    params.set("billing_address_collection", "required");
    params.set("line_items[0][price]", price.id);
    params.set("line_items[0][quantity]", "1");
    params.set("metadata[verification_request_id]", application.id);
    params.set("metadata[user_id]", user.id);
    params.set("subscription_data[metadata][verification_request_id]", application.id);
    params.set("subscription_data[metadata][user_id]", user.id);
    params.set("allow_promotion_codes", "false");

    const sessionResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    const session = await sessionResponse.json();
    if (!sessionResponse.ok) throw new Error(session.error?.message || "A Stripe não conseguiu criar o checkout.");
    const updateResponse = await fetch(SUPABASE_URL + "/rest/v1/kumprall_verification_requests?id=eq." + application.id, {
      method: "PATCH",
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ stripe_checkout_session_id: session.id, payment_status: "checkout_pending" })
    });
    if (!updateResponse.ok) throw new Error("Checkout criado, mas não foi possível registar a sessão. Contacte o apoio.");
    return send(res, 200, { url: session.url });
  } catch (error) {
    return send(res, 500, { error: error.message || "Erro interno ao iniciar o pagamento." });
  }
};
