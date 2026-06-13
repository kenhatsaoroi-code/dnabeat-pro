// =====================================================================
// POST /api/activate
// Called by the client right after PayPal onApprove.
// Body: { subscriptionID }
// Auth: Authorization: Bearer <supabase access_token>
// Verifies the subscription with PayPal, then marks the user premium.
// =====================================================================
import { cors, readJson, getUser, admin } from "./_lib.js";
import { paypalBase, paypalToken } from "./_paypal.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "method_not_allowed" });

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const { subscriptionID } = await readJson(req);
    if (!subscriptionID)
      return res.status(400).json({ error: "missing_subscription" });

    const token = await paypalToken();
    const r = await fetch(
      `${paypalBase()}/v1/billing/subscriptions/${subscriptionID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok)
      return res.status(502).json({ error: "paypal_lookup_failed" });

    const sub = await r.json();
    const active = ["ACTIVE", "APPROVED"].includes(sub.status);
    if (!active)
      return res
        .status(402)
        .json({ error: "not_active", status: sub.status });

    await admin
      .from("profiles")
      .update({
        is_premium: true,
        plan: "premium",
        paypal_sub_id: subscriptionID,
        premium_until: null,
      })
      .eq("id", user.id);

    return res.status(200).json({ ok: true, premium: true });
  } catch (e) {
    console.error("activate error", e);
    return res.status(500).json({ error: "server_error" });
  }
}
