// =====================================================================
// POST /api/youtube — VidTrending web: analyze thumbnail + title + desc
// Body: { lang, title, desc, thumb?: { mime, data(base64) } }
// Gated like /api/analyze: free users limited per day, premium/admin unlimited.
// (Video/ffmpeg analysis is desktop-only and not available here.)
// =====================================================================
import { cors, readJson, getUser, getProfile, isPremium, getTodayUsage, bumpUsage, FREE_DAILY_LIMIT } from "./_lib.js";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
const MAX_IMG_BYTES = 4 * 1024 * 1024;

const SYS =
  "You are VidTrending, a YouTube pre-publish analyzer. You receive a thumbnail image, a title and a description. " +
  "Analyze SPECIFICALLY for THIS video — if the title is weak or clickbait-empty, score it low. " +
  "Return ONLY valid minified JSON (no markdown, no backticks) with this exact shape:\n" +
  '{"overall":<0-100>,"summary":"<1-2 sentences about THIS video>",' +
  '"thumbnail":{"score":<0-100>,"issues":[{"area":"<Text|Face|Colors|Layout|Contrast>","status":"<critical|warning|good>","msg":"<specific>","fixes":["<1>","<2>"]}]},' +
  '"title":{"score":<0-100>,"length":<num>,"checks":[{"label":"<Keyword|Power word|Number|Under 60 chars|Emotional trigger|Curiosity gap>","pass":<bool>,"detail":"<why>"}],"suggestions":["<t1>","<t2>","<t3>"]},' +
  '"description":{"score":<0-100>,"issues":["<i1>"],"suggestions":["<s1>","<s2>"]},' +
  '"market":{"estimatedViews":"<range>","bestTime":"<when>","countries":[{"flag":"<emoji>","name":"<country>","cpm":"<$X.XX>"}]}}' +
  "\nGive 3+ thumbnail issues, all 6 title checks, 3 title suggestions, 3+ countries. Be honest.";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!GEMINI_KEY) return res.status(500).json({ error: "gemini_not_configured" });

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const profile = await getProfile(user);
    const premium = isPremium(profile);
    const body = await readJson(req);
    const lang = body.lang === "vi" ? "vi" : "en";
    const title = String(body.title || "").slice(0, 300);
    const desc = String(body.desc || "").slice(0, 4000);

    if (!title && !body.thumb) {
      return res.status(400).json({ error: "need_input", message: "Provide at least a title or a thumbnail." });
    }

    if (!premium) {
      const used = await getTodayUsage(user.id);
      if (used >= FREE_DAILY_LIMIT) {
        return res.status(429).json({
          error: "daily_limit", used, limit: FREE_DAILY_LIMIT,
          message: `You've used all ${FREE_DAILY_LIMIT} free runs today. Go Premium for unlimited.`,
        });
      }
    }

    const parts = [];
    if (body.thumb?.data && body.thumb?.mime) {
      const approx = Math.floor((body.thumb.data.length * 3) / 4);
      if (approx <= MAX_IMG_BYTES) {
        parts.push({ inlineData: { mimeType: body.thumb.mime, data: body.thumb.data } });
      }
    }
    parts.push({
      text:
        `Analyze this YouTube video.\nTITLE: ${title || "(none)"}\nDESCRIPTION: ${desc || "(none)"}\n` +
        (body.thumb ? "A thumbnail image is attached." : "No thumbnail attached — score thumbnail 0 and flag it.") +
        (lang === "vi" ? "\nWrite all msg/detail/summary/fixes/suggestions text in Vietnamese." : ""),
    });

    const payload = {
      systemInstruction: { parts: [{ text: SYS }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.5, topP: 0.9, maxOutputTokens: 4096, responseMimeType: "application/json" },
    };

    const result = await callGemini(payload);
    if (!result.ok) return res.status(502).json({ error: "gemini_failed", detail: result.error });

    let data;
    try { data = JSON.parse(result.text); }
    catch (_) {
      const m = result.text.match(/\{[\s\S]*\}/);
      data = m ? JSON.parse(m[0]) : null;
    }
    if (!data) return res.status(502).json({ error: "bad_json" });

    if (!premium) { try { await bumpUsage(user.id); } catch (_) {} }

    return res.status(200).json({ ok: true, model: result.model, analysis: data });
  } catch (e) {
    console.error("youtube error", e);
    return res.status(500).json({ error: "server_error" });
  }
}

async function callGemini(payload) {
  let lastErr = "no_models";
  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { lastErr = `${model}:${r.status}`; continue; }
      const json = await r.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
      if (!text) { lastErr = `${model}:empty`; continue; }
      return { ok: true, model, text };
    } catch (e) { lastErr = `${model}:${e.message}`; }
  }
  return { ok: false, error: lastErr };
}
