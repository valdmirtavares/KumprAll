const crypto = require("crypto");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.URL_SUPABASE;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

module.exports.config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function verifySignature(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map(part => part.split("=").map(v => v.trim())));
  if (!parts.t || !parts.v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (age > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(parts.t + "." + raw.toString("utf8")).digest("hex");
  const a = Buffer.from(expected, "hex"), b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function supabasePatch(path, body) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "PATCH",
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Falha ao actualizar o estado da certificação.");
}
async function activateCertification(requestId, subscriptionId, customerId, paidUntil) {
  const q = new URLSearchParams({ select: "id,user_id", id: "eq." + requestId, limit: "1" });
  const r = await fetch(SUPABASE_URL + "/rest/v1/kumprall_verification_requests?" + q, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY }
  });
  if (!r.ok) throw new Error("Não foi possível localizar a candidatura associada.");
  const rows = await r.json(), row = rows[0];
  if (!row) throw new Error("Candidatura associada não encontrada.");
  await supabasePatch("kumprall_verification_requests?id=eq." + requestId, {
    stripe_subscription_id: subscriptionId, stripe_customer_id: customerId, payment_status: "paid", certification_paid_until: new Date(paidUntil * 1000).toISOString()
  });
  await supabasePatch("kumprall_profiles?user_id=eq." + row.user_id, {
    verification_status: "verified", verified_at: new Date().toISOString(), verification_expires_at: new Date(paidUntil * 1000).toISOString()
  });
}
async function findRequestBySubscription(subscriptionId) {
  const q = new URLSearchParams({ select: "id", stripe_subscription_id: "eq." + subscriptionId, limit: "1" });
  const r = await fetch(SUPABASE_URL + "/rest/v1/kumprall_verification_requests?" + q, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY }
  });
  if (!r.ok) throw new Error("Não foi possível localizar a subscrição.");
  return (await r.json())[0] || null;
}
module.exports = async (req, res) => {
  if (req.method !== "POST") { res.statusCode=405; return res.end("Method not allowed"); }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) { res.statusCode=500; return res.end("Webhook not configured"); }
  try {
    const raw = await rawBody(req);
    if (!verifySignature(raw, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET)) { res.statusCode=400; return res.end("Invalid signature"); }
    const event = JSON.parse(raw.toString("utf8"));
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" && session.payment_status === "paid") {
        const requestId = session.metadata?.verification_request_id || session.client_reference_id;
        const subResponse = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(session.subscription), {
          headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY }
        });
        const subscription = await subResponse.json();
        if (!subResponse.ok) throw new Error("Não foi possível confirmar a subscrição Stripe.");
        const periodEnd = subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end;
        if (!requestId || !periodEnd) throw new Error("Dados de subscrição incompletos.");
        await activateCertification(requestId, session.subscription, session.customer, periodEnd);
      }
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription || invoice.parent?.subscription_details?.subscription;
      if (subscriptionId) {
        const row = await findRequestBySubscription(subscriptionId);
        if (row) {
          const subResponse = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(subscriptionId), { headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY } });
          const subscription = await subResponse.json();
          if (!subResponse.ok) throw new Error("Não foi possível confirmar a renovação.");
          const periodEnd = subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end;
          if (periodEnd) {
            await supabasePatch("kumprall_verification_requests?id=eq." + row.id, { payment_status: "paid", certification_paid_until: new Date(periodEnd * 1000).toISOString() });
            const q = new URLSearchParams({ select: "user_id", id: "eq." + row.id, limit: "1" });
            const rr = await fetch(SUPABASE_URL + "/rest/v1/kumprall_verification_requests?" + q, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY } });
            const app = (await rr.json())[0];
            if (app) await supabasePatch("kumprall_profiles?user_id=eq." + app.user_id, { verification_status: "verified", verified_at: new Date().toISOString(), verification_expires_at: new Date(periodEnd * 1000).toISOString() });
          }
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const row = await findRequestBySubscription(subscription.id);
      if (row) {
        await supabasePatch("kumprall_verification_requests?id=eq." + row.id, { payment_status: "cancelled" });
        const q = new URLSearchParams({ select: "user_id", id: "eq." + row.id, limit: "1" });
        const rr = await fetch(SUPABASE_URL + "/rest/v1/kumprall_verification_requests?" + q, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY } });
        const app = (await rr.json())[0];
        if (app) await supabasePatch("kumprall_profiles?user_id=eq." + app.user_id, { verification_status: "expired", verified_at: null, verification_expires_at: null });
      }
    }
    res.statusCode = 200; res.setHeader("Content-Type","application/json"); res.end(JSON.stringify({ received: true }));
  } catch (error) {
    res.statusCode = 500; res.end(error.message || "Webhook error");
  }
};
