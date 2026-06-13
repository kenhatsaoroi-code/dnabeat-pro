const cfg = window.DNABEAT_CONFIG;
const sb = window.supabase.createClient(
  cfg.SUPABASE_URL,
  cfg.SUPABASE_ANON_KEY
);
window.sb = sb;

const Auth = {
  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  },
  async getToken() {
    const s = await this.getSession();
    return s?.access_token || null;
  },
  async loginGoogle(redirectPath) {
    const redirectTo =
      window.location.origin + (redirectPath || cfg.APP_PATH || "/app");
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  },
  async logout() {
    await sb.auth.signOut();
    window.location.href = "/";
  },
  onChange(cb) {
    sb.auth.onAuthStateChange((_e, session) => cb(session));
  },
  async api(path, options = {}) {
    const token = await this.getToken();
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      options.headers || {},
      token ? { Authorization: "Bearer " + token } : {}
    );
    const res = await fetch(path, { ...options, headers });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data: json };
  },
};
window.Auth = Auth;
