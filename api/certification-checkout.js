const SUPABASE_URL = process.env.SUPABASE_URL || process.env.URL_SUPABASE;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRODUCT_ID = process.env.STRIPE_CERTIFICATION_PRODUCT_ID;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// Diagnóstico seguro: nunca devolve chaves, tokens, IDs de clientes ou dados privados.
function diagnostics() {
  return {
    endpoint: "ok",
    supabaseUrl: Boolean(SUPABASE_URL),
    supabasePublicKey: Boolean(SUPABASE_ANON_KEY),
    supabaseServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    stripeSecret: Boolean(STRIPE_SECRET_KEY),
    stripeMode: STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "unknown",
    stripeProduct: Boolean(STRIPE_PRODUCT_ID),
    stripeProductMode: STRIPE_PRODUCT_ID?.startsWith("prod_") ? "product-id-present" : "missing-or-invalid"
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") return send(res, 200, diagnostics());
  if (req.method !== "POST") return send(res, 405, { error: "Método não permitido." });

  const config = diagnostics();
  const missing = Object.entries(config).filter(([key, value]) =>
    ["supabaseUrl", "supabasePublicKey", "supabaseServiceRole", "stripeSecret", "stripeProduct"].includes(key) && !value
  ).map(([key]) => key);
  if (missing.length) return send(res, 500, {
    error: "A integração de pagamento não está completa no ambiente Preview.",
    missing
  });

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return send(res, 401, { error: "Inicie sessão para continuar." });

  try {
    const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth }
    });
    if (!userResponse.ok) return send(res, 401, { error: "A sessão não foi aceite pelo Supabase. Saia da conta e entre novamente." });
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
    if (!requestResponse.ok) {
      const detail = await requestResponse.text();
      console.error("Certification application lookup failed:", requestResponse.status, detail.slice(0, 500));
      throw new Error("O servidor não conseguiu consultar a candidatura aprovada. Verifique a tabela de candidaturas no Supabase.");
    }
    const requests = await requestResponse.json();
    const application = requests[0];
    if (!application) return send(res, 403, { error: "Não foi encontrada uma candidatura aprovada para esta conta. A candidatura tem de ser aprovada antes do pagamento." });
    if (application.payment_status === "paid") return send(res, 409, { error: "Esta certificação já tem um pagamento confirmado." });
    if (application.stripe_subscription_id) return send(res, 409, { error: "Já existe uma subscrição associada a esta candidatura. Contacte o apoio KUMPRALL." });

    const pricesResponse = await fetch("https://api.stripe.com/v1/prices?product=" + encodeURIComponent(STRIPE_PRODUCT_ID) + "&active=true&limit=100", {
      headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY }
    });
    const prices = await pricesResponse.json();
    if (!pricesResponse.ok) {
      console.error("Stripe price lookup failed:", pricesResponse.status, prices.error?.message);
      throw new Error("A Stripe recusou a consulta dos preços. Confirme se a chave secreta e o produto pertencem ao mesmo modo (teste ou produção).");
    }
    const price = (prices.data || []).find(p =>
      p.currency === "eur" && p.unit_amount === 10000 &&
      p.recurring && p.recurring.interval === "year" && p.active
    );
    if (!price) {
      console.error("No matching annual EUR 100 price for product", STRIPE_PRODUCT_ID);
      return send(res, 500, { error: "O produto existe, mas não foi encontrado um preço activo de 100 € por ano. Confirme no Stripe que o preço é recorrente, anual e em EUR." });
    }

    const forwardedHost = req.headers["x-forwarded-host"] || req.headers.host || "";
    const origin = req.headers.origin && /^https:\/\/[a-z0-9.-]+\.vercel\.app$/i.test(req.headers.origin)
      ? req.headers.origin
      : /^([a-z0-9.-]+\.vercel\.app)$/i.test(forwardedHost) ? "https://" + forwardedHost : "https://kumprall.vercel.app";

    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("success_url", origin + "/?certification=success&session_id={CHECKOUT_SESSION_ID}");
    params.set("cancel_url", origin + "/?certification=cancelled");
    params.set("client_reference_id", application.id);
    if (application.professional_email || user.email) params.set("customer_email", application.professional_email || user.email);
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
    if (!sessionResponse.ok) {
      console.error("Stripe checkout creation failed:", sessionResponse.status, session.error?.message);
      throw new Error(session.error?.message || "A Stripe não conseguiu criar a sessão de pagamento.");
    }

    const updateResponse = await fetch(SUPABASE_URL + "/rest/v1/kumprall_verification_requests?id=eq." + application.id, {
      method: "PATCH",
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ stripe_checkout_session_id: session.id, payment_status: "checkout_pending" })
    });
    if (!updateResponse.ok) {
      const detail = await updateResponse.text();
      console.error("Could not save Stripe checkout session:", updateResponse.status, detail.slice(0, 500));
      throw new Error("A Stripe criou o checkout, mas o KUMPRALL não conseguiu guardar a sessão. Contacte o apoio antes de tentar novamente.");
    }
    return send(res, 200, { url: session.url });
  } catch (error) {
    console.error("Certification checkout error:", error);
    return send(res, 500, { error: error.message || "Erro interno ao iniciar o pagamento." });
  }
};
