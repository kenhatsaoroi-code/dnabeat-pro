// =====================================================================
// POST /api/timing   — Tab 4: Timing Lyrics (Premium only)
// Body: { storagePath: string, mime: string, lang: 'vi'|'en', dsp? }
//
// 2-tier pipeline:
//   Tier 1  Whisper (OpenAI)  -> word/segment-level timestamps + transcript
//   Tier 2  Gemini            -> re-listens to the audio + reads Whisper
//                                transcript, fixes mishears, detects
//                                Intro/Verse/Chorus/Bridge, and returns:
//                                  a) timed lyrics  [MM:SS] per line
//                                  b) Suno-ready lyrics (paste into Suno)
//
// Audio is uploaded by the client to a private Supabase Storage bucket
// ('audio'), so it never hits Vercel's 4.5 MB request-body limit. The
// server downloads it with the service role, then deletes it afterwards.
// All API keys (OpenAI, Gemini) stay server-side.
// =====================================================================
import { cors, readJson, getUser, getProfile, isPremium, admin, getTodayUsage, bumpUsage, FREE_DAILY_LIMIT } from "./_lib.js";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

// Gemini inline audio cap (keep the re-listen request sane).
const MAX_INLINE_BYTES = 18 * 1024 * 1024;
const AUDIO_BUCKET = "audio";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!GEMINI_KEY) return res.status(500).json({ error: "gemini_not_configured" });

  let storagePath = null;
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const profile = await getProfile(user);
    const premium = isPremium(profile);
    const body = await readJson(req);
    const lang = body.lang === "en" ? "en" : "vi";

    // --- Free users allowed up to the daily limit; Premium = unlimited ---
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

    storagePath = String(body.storagePath || "");
    const mime = body.mime || "audio/mpeg";
    // Path must live under the caller's own folder: "<uid>/...."
    if (!storagePath || storagePath.split("/")[0] !== user.id) {
      return res.status(400).json({ error: "bad_path" });
    }

    // --- Pull the audio back from Supabase Storage -------------------
    const dl = await admin.storage.from(AUDIO_BUCKET).download(storagePath);
    if (dl.error || !dl.data) {
      return res.status(404).json({ error: "audio_not_found", detail: dl.error?.message });
    }
    const arrayBuf = await dl.data.arrayBuffer();
    const bytes = Buffer.from(arrayBuf);

    // --- Tier 1: Whisper (optional — graceful fallback) -------------
    let transcript = null;
    let whisperUsed = false;
    if (OPENAI_KEY) {
      try {
        transcript = await whisperTranscribe(bytes, mime);
        whisperUsed = !!transcript;
      } catch (e) {
        // Non-fatal: fall back to Gemini-only listening.
        console.error("whisper failed", e?.message);
      }
    }

    // --- Tier 2: Gemini cleanup + structure + 2 formats -------------
    const parts = [];
    if (bytes.length <= MAX_INLINE_BYTES) {
      parts.push({ inlineData: { mimeType: mime, data: bytes.toString("base64") } });
    }
    parts.push({ text: buildTimingPrompt(lang, body.dsp, transcript, body.userLyrics) });

    const payload = {
      systemInstruction: { parts: [{ text: timingSystem(lang) }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 4096 },
    };

    const result = await callGemini(payload);
    if (!result.ok) {
      return res.status(502).json({ error: "gemini_failed", detail: result.error });
    }

    const { timed, suno } = splitFormats(result.text);

    if (!premium) { try { await bumpUsage(user.id); } catch (_) {} }

    return res.status(200).json({
      ok: true,
      lang,
      model: result.model,
      whisper: whisperUsed,
      timed,
      suno,
      raw: result.text,
    });
  } catch (e) {
    console.error("timing error", e);
    return res.status(500).json({ error: "server_error" });
  } finally {
    // Best-effort cleanup so we don't hoard user audio.
    if (storagePath) {
      admin.storage.from(AUDIO_BUCKET).remove([storagePath]).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------
// Tier 1 — Whisper transcription with timestamps
// ---------------------------------------------------------------------
async function whisperTranscribe(bytes, mime) {
  const ext = extFromMime(mime);
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("timestamp_granularities[]", "segment");

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: fd,
  });
  if (!r.ok) throw new Error("whisper_" + r.status);
  const json = await r.json();

  // Build word-level timestamps (most precise)
  const words = Array.isArray(json.words) ? json.words : [];
  const wordLines = words.map((w) => `[${fmtMs(w.start)}] ${(w.word || "").trim()}`);

  // Also build segment-level as fallback
  const segs = Array.isArray(json.segments) ? json.segments : [];
  const segLines = segs.map((s) => `[${fmtMs(s.start)}] ${(s.text || "").trim()}`);

  return {
    language: json.language || null,
    fullText: json.text || "",
    wordTimestamps: wordLines.join("\n"),
    segmentTimestamps: segLines.join("\n"),
    lines: wordLines.length ? wordLines.join("\n") : segLines.join("\n"),
  };
}

// ---------------------------------------------------------------------
// Tier 2 — Gemini prompt builders
// ---------------------------------------------------------------------
function timingSystem(lang) {
  return "You are an expert at time-aligning song lyrics using Whisper word-level timestamps. " +
    "You STRICTLY follow the timestamps from Whisper — each line's timestamp equals the FIRST word's onset time. " +
    "You never delay or shift timestamps later. You detect song structure (Intro/Verse/Chorus/Bridge/Outro). " +
    "When original lyrics are provided, you keep them word-for-word and only add time marks.";
}

function buildTimingPrompt(lang, dsp, transcript, userLyrics) {
  const L = lang === "vi";
  const dur = dsp?.durationSec;
  const bpm = dsp?.bpm;
  const lyrics = (userLyrics || "").trim();

  // Build transcript section with word-level precision
  let tx = "";
  if (transcript?.wordTimestamps) {
    tx = "\n\nWHISPER WORD-LEVEL TIMESTAMPS (each word with its exact start time — TRUST THESE TIMES):\n" +
      transcript.wordTimestamps;
    if (transcript.segmentTimestamps) {
      tx += "\n\nWHISPER SEGMENT-LEVEL (for cross-reference):\n" + transcript.segmentTimestamps;
    }
  } else if (transcript?.lines) {
    tx = "\n\nWhisper transcript with timestamps:\n" + transcript.lines;
  } else {
    tx = "\n\n(No Whisper transcript available — transcribe by listening)";
  }

  const timing_critical = "\n\nCRITICAL TIMING RULES:" +
    "\n- Each lyric line's timestamp = the FIRST WORD's start time from Whisper. Do NOT delay." +
    "\n- If Whisper says a word starts at [00:12.34], that line's timestamp is [00:12], NOT later." +
    "\n- Timestamps must match the ONSET of singing/vocals, not the middle or end of the phrase." +
    "\n- NEVER shift timestamps later. If anything, round DOWN (earlier) not up (later).";

  // --- Mode A: user supplied exact original lyrics ---
  if (lyrics) {
    const head = "You are given the EXACT ORIGINAL LYRICS. DO NOT change any words. " +
      `Track length ${dur ? "≈ " + dur + "s" : "(per audio)"}${bpm ? ", BPM ≈ " + bpm : ""}.\n\n` +
      "ORIGINAL LYRICS (ground truth — keep every word exactly):\n" + lyrics + tx +
      "\n\nTask: MAP each original-lyrics line to its exact start time using the Whisper word timestamps above. " +
      "For each line, find where its FIRST WORD appears in the Whisper timestamps and use that time. " +
      "DO NOT rewrite or rephrase any lyrics. Detect Intro/Verse/Chorus/Bridge/Outro." + timing_critical;
    return head + timingRules(L);
  }

  // --- Mode B: no lyrics — transcribe by ear ---
  const head = "Listen to the song and produce TIME-ALIGNED lyrics. " +
    `True length ${dur ? "≈ " + dur + "s" : "(per audio)"}${bpm ? ", BPM ≈ " + bpm : ""}. ` +
    "If instrumental, describe musical sections by timestamp." + tx + timing_critical;

  return head + timingRules(L);
}

function timingRules(L) {
  return "\n\nReturn EXACTLY two code blocks, nothing else outside them (a short note after the second block is okay):\n" +
    "1) A ```timed block — each line `[MM:SS] lyric...`, increasing from [00:00], with structure lines like `[00:12] [Chorus]` placed correctly. Use the EARLIEST possible timestamp for each line.\n" +
    "2) A ```suno block — clean lyrics to paste into Suno's Lyrics box: NO timestamps, use [Intro] [Verse] [Chorus] [Bridge] [Outro] tags, natural line breaks.";
}

// Pull the two fenced blocks back out for clean client rendering.
function splitFormats(text) {
  const grab = (tag) => {
    const re = new RegExp("```" + tag + "\\s*\\n([\\s\\S]*?)```", "i");
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  let timed = grab("timed");
  let suno = grab("suno");
  // Fallbacks if the model didn't label the fences.
  if (!timed && !suno) {
    const blocks = [...text.matchAll(/```\w*\s*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
    timed = blocks[0] || text.trim();
    suno = blocks[1] || "";
  }
  return { timed, suno };
}

// ---------------------------------------------------------------------
// Gemini caller (model fallback)
// ---------------------------------------------------------------------
async function callGemini(payload) {
  let lastErr = "no_models";
  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { lastErr = `${model}:${r.status}`; continue; }
      const json = await r.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
      if (!text) { lastErr = `${model}:empty`; continue; }
      return { ok: true, model, text };
    } catch (e) {
      lastErr = `${model}:${e.message}`;
    }
  }
  return { ok: false, error: lastErr };
}

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtMs(sec) {
  sec = Math.max(0, sec || 0);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.round((sec % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}
function extFromMime(mime) {
  const map = {
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a",
    "audio/ogg": "ogg", "audio/webm": "webm", "audio/flac": "flac",
  };
  return map[mime] || "mp3";
}
