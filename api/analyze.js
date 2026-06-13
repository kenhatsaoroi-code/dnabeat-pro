// =====================================================================
// POST /api/analyze
// Body: { mode, lang, audio?, dsp?, context? }
//   mode    : 'scan' | 'refine' | 'variation'
//   lang    : 'vi' | 'en'
//   audio   : { mime: string, data: base64string }   (optional)
//   dsp     : { bpm, key, bands, stereo, durationSec } (client-side analysis)
//   context : { prompt?: string, styles?: string[] }   (for refine / variation)
//
// Auth: Authorization: Bearer <supabase access_token>
// Tier: free => mode must be 'scan' AND under daily limit; premium => unlimited.
// The Gemini API key never leaves the server.
// =====================================================================
import {
  cors,
  readJson,
  getUser,
  getProfile,
  isPremium,
  getTodayUsage,
  bumpUsage,
  FREE_DAILY_LIMIT,
} from "./_lib.js";

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Tried in order — first that responds wins (graceful fallback).
const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

// Hard cap on inbound audio so we stay under the serverless body limit.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // ~4 MB base64-decoded

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "method_not_allowed" });

  if (!GEMINI_KEY)
    return res.status(500).json({ error: "gemini_not_configured" });

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const profile = await getProfile(user);
    const premium = isPremium(profile);

    const body = await readJson(req);
    const mode = ["scan", "refine", "variation"].includes(body.mode)
      ? body.mode
      : "scan";
    const lang = body.lang === "en" ? "en" : "vi";

    // --- Tier gating -------------------------------------------------
    if (!premium && mode !== "scan") {
      return res.status(403).json({
        error: "premium_required",
        message:
          lang === "vi"
            ? "Tab này chỉ dành cho Premium. Nâng cấp để mở khoá Tinh chỉnh 99%, Biến tấu Style & Timing Lyric."
            : "This tab is Premium-only. Upgrade to unlock Refine 99%, Style Variation & Timing Lyric.",
      });
    }

    if (!premium) {
      const used = await getTodayUsage(user.id);
      if (used >= FREE_DAILY_LIMIT) {
        return res.status(429).json({
          error: "daily_limit",
          used,
          limit: FREE_DAILY_LIMIT,
          message:
            lang === "vi"
              ? `Bạn đã dùng hết ${FREE_DAILY_LIMIT} lượt miễn phí hôm nay. Nâng cấp Premium để dùng không giới hạn.`
              : `You've used all ${FREE_DAILY_LIMIT} free runs today. Go Premium for unlimited.`,
        });
      }
    }

    // --- Build the Gemini request ------------------------------------
    const parts = [];
    const audio = body.audio;
    if (audio?.data && audio?.mime) {
      const approxBytes = Math.floor((audio.data.length * 3) / 4);
      if (approxBytes > MAX_AUDIO_BYTES) {
        return res.status(413).json({
          error: "audio_too_large",
          message:
            lang === "vi"
              ? "Đoạn audio quá lớn. Tool sẽ tự cắt ~60s mono — thử lại hoặc dùng file ngắn hơn."
              : "Audio clip too large. The tool trims to ~60s mono — retry or use a shorter file.",
        });
      }
      parts.push({ inlineData: { mimeType: audio.mime, data: audio.data } });
    }
    parts.push({ text: buildUserPrompt(mode, lang, body) });

    const payload = {
      systemInstruction: { parts: [{ text: systemPrompt(lang) }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096 },
    };

    const result = await callGeminiWithFallback(payload);
    if (!result.ok) {
      return res
        .status(502)
        .json({ error: "gemini_failed", detail: result.error });
    }

    // --- Count usage (only on success) -------------------------------
    let used = null;
    if (!premium) {
      used = await bumpUsage(user.id);
    }

    return res.status(200).json({
      ok: true,
      mode,
      lang,
      model: result.model,
      text: result.text,
      usage: premium
        ? { premium: true }
        : { premium: false, used, limit: FREE_DAILY_LIMIT },
    });
  } catch (e) {
    console.error("analyze error", e);
    return res.status(500).json({ error: "server_error" });
  }
}

// ---------------------------------------------------------------------
// Gemini caller with model fallback
// ---------------------------------------------------------------------
async function callGeminiWithFallback(payload) {
  let lastErr = "no_models";
  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        lastErr = `${model}:${r.status}`;
        // 429/5xx => try next model; 4xx config errors also fall through
        continue;
      }
      const json = await r.json();
      const text =
        json?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("")
          .trim() || "";
      if (!text) {
        lastErr = `${model}:empty`;
        continue;
      }
      return { ok: true, model, text };
    } catch (e) {
      lastErr = `${model}:${e.message}`;
    }
  }
  return { ok: false, error: lastErr };
}

// ---------------------------------------------------------------------
// Prompt engineering — MUSIC DNA v3
// ---------------------------------------------------------------------
function systemPrompt(lang) {
  if (lang === "vi") {
    return [
      "Bạn là MUSIC DNA v3 — chuyên gia phân tích nhạc cho người sáng tạo trên Suno/AI music.",
      "Bạn THỰC SỰ nghe đoạn audio được cung cấp (nếu có) và mô tả chính xác những gì nghe được:",
      "thể loại, mood, nhạc cụ, cấu trúc, giọng hát, không gian/mix, tốc độ cảm nhận.",
      "Kết hợp với số liệu DSP do client gửi (BPM, key, dải tần, stereo) để củng cố nhận định.",
      "Trả lời bằng tiếng Việt, định dạng Markdown rõ ràng, dùng tiêu đề và danh sách khi hợp lý.",
      "Khi tạo prompt cho Suno: viết style tags ngắn gọn, mạnh, phân tách bằng dấu phẩy, kèm BPM và key.",
      "Tránh bịa thông tin không nghe thấy; nếu không có audio, nói rõ là suy luận từ số liệu/ngữ cảnh.",
    ].join(" ");
  }
  return [
    "You are MUSIC DNA v3 — a music-analysis expert for Suno/AI-music creators.",
    "You ACTUALLY listen to the provided audio (if any) and describe precisely what you hear:",
    "genre, mood, instruments, structure, vocals, space/mix, perceived tempo.",
    "Combine this with the client DSP metrics (BPM, key, bands, stereo) to back up your read.",
    "Reply in English, clean Markdown, use headings and lists where helpful.",
    "When producing a Suno prompt: short punchy style tags, comma-separated, include BPM and key.",
    "Never invent details you didn't hear; if no audio, say you're inferring from metrics/context.",
  ].join(" ");
}

function dspBlock(lang, dsp) {
  if (!dsp) return "";
  const L = lang === "vi";
  const b = dsp.bands || {};
  return (
    `\n\n${L ? "Số liệu DSP (client)" : "Client DSP metrics"}:\n` +
    `- BPM: ${dsp.bpm ?? "?"}\n` +
    `- Key: ${dsp.key ?? "?"}\n` +
    `- ${L ? "Thời lượng" : "Duration"}: ${dsp.durationSec ?? "?"}s\n` +
    `- ${L ? "Dải tần" : "Bands"}: sub=${b.sub ?? "?"} low=${b.low ?? "?"} mid=${b.mid ?? "?"} high=${b.high ?? "?"} air=${b.air ?? "?"}\n` +
    `- ${L ? "Độ rộng stereo" : "Stereo width"}: ${dsp.stereo ?? "?"}`
  );
}

function buildUserPrompt(mode, lang, body) {
  const L = lang === "vi";
  const dsp = dspBlock(lang, body.dsp);
  const ctx = body.context || {};

  if (mode === "scan") {
    return (
      (L
        ? "Hãy QUÉT bản nhạc này và tạo prompt. Trình bày các phần:\n" +
          "1) 🧬 DNA tổng quan (thể loại, mood, vibe)\n" +
          "2) 🎚️ Phân tích nghe được (nhạc cụ, cấu trúc, vocal, mix/không gian)\n" +
          "3) 🎯 PROMPT SUNO (khối code, style tags + BPM + key, sẵn sàng copy)\n" +
          "4) ✍️ Gợi ý lyric / cấu trúc bài (Intro/Verse/Chorus...)"
        : "SCAN this track and create a prompt. Sections:\n" +
          "1) 🧬 DNA overview (genre, mood, vibe)\n" +
          "2) 🎚️ What you hear (instruments, structure, vocals, mix/space)\n" +
          "3) 🎯 SUNO PROMPT (code block, style tags + BPM + key, copy-ready)\n" +
          "4) ✍️ Lyric/structure suggestion (Intro/Verse/Chorus...)") + dsp
    );
  }

  if (mode === "refine") {
    return (
      (L
        ? "TINH CHỈNH 99%: so sánh audio tham chiếu với prompt hiện tại và chỉnh để khớp ~99%.\n" +
          "Chỉ ra điểm lệch (BPM, key, instrumentation, tone, mix) và đưa prompt mới đã tinh chỉnh trong khối code."
        : "REFINE 99%: compare the reference audio with the current prompt and tune it to ~99% match.\n" +
          "List the gaps (BPM, key, instrumentation, tone, mix) and give the refined prompt in a code block.") +
      `\n\n${L ? "Prompt hiện tại" : "Current prompt"}:\n${ctx.prompt || "(none)"}` +
      dsp
    );
  }

  // variation
  const styles = (ctx.styles || []).join(", ") || (L ? "(tự đề xuất)" : "(suggest)");
  const voice = ctx.voice || (L ? "(giữ giọng gốc)" : "(keep original vocal)");
  const mood = ctx.mood || (L ? "(giữ mood gốc)" : "(keep original mood)");
  return (
    (L
      ? "BIẾN TẤU STYLE: giữ DNA cốt lõi (giai điệu/cảm xúc) nhưng đổi phong cách theo yêu cầu.\n" +
        `Style mục tiêu: ${styles}\n` +
        `Giọng hát mong muốn: ${voice}\n` +
        `Mood/cảm xúc: ${mood}\n` +
        "Với MỖI style, đưa: tên, mô tả ngắn, và 1 PROMPT SUNO riêng (code block) — nhúng cả chỉ dẫn giọng hát + mood + BPM + key gợi ý."
      : "STYLE VARIATION: keep the core DNA (melody/emotion) but morph per the request.\n" +
        `Target styles: ${styles}\n` +
        `Desired vocal: ${voice}\n` +
        `Mood/emotion: ${mood}\n` +
        "For EACH style give: name, short description, and its own SUNO PROMPT (code block) — bake in the vocal + mood + suggested BPM + key.") +
    dsp
  );
}
