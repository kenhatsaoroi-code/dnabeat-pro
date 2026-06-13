// =====================================================================
// POST /api/paypal-webhook
// Configure in PayPal Dashboard → Webhooks, pointing to:
//   https://dnabeat.pro/api/paypal-webhook
// Subscribe to: BILLING.SUBSCRIPTION.ACTIVATED / .CANCELLED / .EXPIRED /
//               .SUSPENDED  and  PAYMENT.SALE.COMPLETED
//
// We map a subscription to a user via custom_id (the Supabase user id we
// attach when creating the subscription in the browser).
// =====================================================================
import { admin, readJson } from "./_lib.js";
import { paypalBase, paypalToken } from "./_paypal.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "method_not_allowed" });

  try {
    const event = await readJson(req);

    // Verify the webhook signature with PayPal (recommended in production).
    const verified = await verifySignature(req, event);
    if (!verified) {
      console.warn("paypal webhook signature not verified");
      // Still 200 so PayPal doesn't hammer retries; we just don't act.
      return res.status(200).json({ ok: false, reason: "unverified" });
    }

    const type = event.event_type;
    const resource = event.resource || {};
    const subId = resource.id || resource.billing_agreement_id;
    const userId = resource.custom_id || resource.custom; // we set this client-side

    const setPremium = async (premium, extra = {}) => {
      if (userId) {
        await admin
          .from("profiles")
          .update({
            is_premium: premium,
            plan: premium ? "premium" : "free",
            paypal_sub_id: subId || null,
            ...extra,
          })
          .eq("id", userId);
      } else if (subId) {
        await admin
          .from("profiles")
          .update({ is_premium: premium, plan: premium ? "premium" : "free", ...extra })
          .eq("paypal_sub_id", subId);
      }
    };

    switch (type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "PAYMENT.SALE.COMPLETED":
        await setPremium(true, { premium_until: null });
        break;
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
      case "BILLING.SUBSCRIPTION.SUSPENDED":
        await setPremium(false);
        break;
      default:
        // ignore other events
        break;
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error", e);
    return res.status(200).json({ ok: false }); // avoid retry storms
  }
}

async function verifySignature(req, event) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  try {
    const token = await paypalToken();
    const r = await fetch(
      `${paypalBase()}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: req.headers["paypal-auth-algo"],
          cert_url: req.headers["paypal-cert-url"],
          transmission_id: req.headers["paypal-transmission-id"],
          transmission_sig: req.headers["paypal-transmission-sig"],
          transmission_time: req.headers["paypal-transmission-time"],
          webhook_id: webhookId,
          webhook_event: event,
        }),
      }
    );
    const json = await r.json();
    return json.verification_status === "SUCCESS";
  } catch (e) {
    console.error("verify error", e);
    return false;
  }
}
