// =====================================================================
// PUBLIC config — safe to ship to the browser.
// These keys are designed to be public (anon/publishable + PayPal client id).
// Real secrets (Gemini, service role, PayPal secret) live in /api only.
// =====================================================================
window.DNABEAT_CONFIG = {
  SUPABASE_URL: "https://ynyfvszgxhmldjnlcmcy.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_gHDgLR-T4w6Gjk2bsIHTZg_1fbt8-dD",

  PAYPAL_CLIENT_ID: "AWi9P8SawyFUKD_g8vjK6jfjxiOnjMzYj7qwiDQsCQldRiZOC7ieKkAA_LWNRD8HMisVRJ1vc_n6Jxq-",
  PAYPAL_PLAN_ID: "P-0KR80083D0352722YNIWMO5Y",

  PRICE_USD: 10,
  FREE_DAILY_LIMIT: 5,

  // where to land after Google login
  APP_PATH: "/app",
};
