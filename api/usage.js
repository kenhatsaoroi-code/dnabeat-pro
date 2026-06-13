// =====================================================================
// GET /api/usage
// Returns the caller's plan and today's quota.
// Requires: Authorization: Bearer <supabase access_token>
// =====================================================================
import {
  cors,
  getUser,
  getProfile,
  isPremium,
  getTodayUsage,
  FREE_DAILY_LIMIT,
} from "./_lib.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "method_not_allowed" });

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const profile = await getProfile(user);
    const premium = isPremium(profile);
    const used = await getTodayUsage(user.id);
    const limit = premium ? null : FREE_DAILY_LIMIT;
    const remaining = premium ? null : Math.max(0, FREE_DAILY_LIMIT - used);

    return res.status(200).json({
      user: {
        id: user.id,
        email: profile?.email || user.email,
        name: profile?.full_name || null,
        avatar: profile?.avatar_url || null,
      },
      premium,
      plan: premium ? "premium" : "free",
      used,
      limit,
      remaining,
    });
  } catch (e) {
    console.error("usage error", e);
    return res.status(500).json({ error: "server_error" });
  }
}
