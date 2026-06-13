;(function(){
// =====================================================================
// app.js — MUSIC DNA v3 client
// =====================================================================
const cfg = window.DNABEAT_CONFIG;

const state = {
  premium: false,
  user: null,
  tab: "scan",
  audioBuffer: null,
  clipB64: null,
  clipMime: "audio/wav",
  dsp: null,
  styles: new Set(),
  voice: "",
  mood: "",
  busy: false,
  fileBase: "track",
  file: null,
};

const STYLE_OPTIONS = [
  "Lo-fi", "Phonk", "Synthwave", "Orchestral", "EDM / Festival",
  "Trap", "Drum & Bass", "City Pop", "Acoustic", "Cinematic",
  "Future Bass", "Bossa Nova", "Hardstyle", "Ambient",
];

// 8 voices — label + Vietnamese/English description (shown as tooltip)
const VOICE_OPTIONS = [
  { id: "Nữ trong trẻo",    en: "Bright female",   vi: "Giọng nữ cao, sáng, ngọt",          d_en: "High, bright, sweet female vocal" },
  { id: "Nam ấm trầm",      en: "Warm male",       vi: "Giọng nam trầm, ấm, chững chạc",     d_en: "Deep, warm, grounded male vocal" },
  { id: "Rap / Hip-hop",    en: "Rap / Hip-hop",   vi: "Đọc rap dứt khoát, flow nhanh",      d_en: "Punchy rap, fast flow" },
  { id: "Thì thầm",         en: "Whisper",         vi: "Hát thì thầm, gần gũi, ASMR",        d_en: "Whispered, intimate, ASMR" },
  { id: "Soul / R&B",       en: "Soul / R&B",      vi: "Luyến láy, nhiều cảm xúc, rung",     d_en: "Soulful runs, emotive, vibrato" },
  { id: "Rock gằn",         en: "Rock / gritty",   vi: "Giọng khỏe, gằn, năng lượng cao",    d_en: "Strong, gritty, high energy" },
  { id: "Trẻ em đáng yêu",  en: "Cute / childlike",vi: "Giọng cao, tươi vui, hồn nhiên",     d_en: "High, cheerful, playful" },
  { id: "Robot auto-tune",  en: "Robot / auto-tune",vi: "Vocoder, điện tử, futuristic",      d_en: "Vocoder, electronic, futuristic" },
];

// 8 moods — label + Vietnamese/English description
const MOOD_OPTIONS = [
  { id: "Vui tươi",      en: "Upbeat",     vi: "Năng lượng tích cực, rộn ràng",   d_en: "Positive, lively energy" },
  { id: "Buồn tâm trạng",en: "Melancholic",vi: "Sâu lắng, da diết",               d_en: "Deep, wistful, aching" },
  { id: "Lãng mạn",      en: "Romantic",   vi: "Ngọt ngào, tình cảm",             d_en: "Sweet, tender, loving" },
  { id: "Hùng tráng",    en: "Epic",       vi: "Bùng nổ, cao trào, anthemic",     d_en: "Explosive, climactic, anthemic" },
  { id: "Chill thư giãn",en: "Chill",      vi: "Nhẹ nhàng, lo-fi, êm",            d_en: "Soft, lo-fi, easy" },
  { id: "Bí ẩn u tối",   en: "Dark",       vi: "Huyền bí, dark, cinematic",       d_en: "Mysterious, dark, cinematic" },
  { id: "Hoài niệm",     en: "Nostalgic",  vi: "Retro, vintage, man mác",         d_en: "Retro, vintage, bittersweet" },
  { id: "Mạnh mẽ tự tin",en: "Confident",  vi: "Bốc, máu lửa, empowering",        d_en: "Bold, fiery, empowering" },
];

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
(async function boot() {
  I18N.set(I18N.lang);
  if (window.renderHelix) {/* helix only on landing */}

  const session = await Auth.getSession();
  if (!session) { window.location.href = "/"; return; }

  buildStyleChips();
  wireUI();
  await refreshUsage();
})();

// ---------------------------------------------------------------------
// Usage / plan
// ---------------------------------------------------------------------
async function refreshUsage() {
  const { ok, data } = await Auth.api("/api/usage");
  if (!ok) return;
  state.premium = !!data.premium;
  state.user = data.user;

  $("welcome").textContent = `${I18N.t("app.welcome")}, ${data.user.name || data.user.email}`;
  if (data.user.avatar) { $("avatar").src = data.user.avatar; $("avatar").style.display = "block"; }

  const badge = $("planBadge");
  badge.textContent = state.premium ? "PREMIUM" : "FREE";
  badge.className = "badge " + (state.premium ? "premium" : "free");

  $("quota").textContent = state.premium
    ? I18N.t("app.unlimited")
    : `${I18N.t("app.remaining")}: ${data.remaining}/${data.limit}`;

  $("upgradeBtn").style.display = state.premium ? "none" : "inline-flex";

  // lock styling on tabs
  document.querySelectorAll(".tab .lock").forEach((l) => {
    l.style.display = state.premium ? "none" : "inline-block";
  });
  updateRunState();
}

// ---------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------
function wireUI() {
  $("logoutBtn").onclick = () => Auth.logout();
  $("upgradeBtn").onclick = openPaywall;
  $("payClose").onclick = () => $("payModal").classList.remove("show");
  $("payModal").onclick = (e) => { if (e.target === $("payModal")) $("payModal").classList.remove("show"); };

  // tabs
  document.querySelectorAll(".tab").forEach((t) => {
    t.onclick = () => selectTab(t.dataset.tab);
  });

  // dropzone
  const dz = $("dropzone"), fi = $("fileInput");
  dz.onclick = () => fi.click();
  fi.onchange = (e) => e.target.files[0] && handleFile(e.target.files[0]);
  ["dragover", "dragenter"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); })
  );
  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  $("runBtn").onclick = runAnalyze;

  // re-apply run label when language flips
  const origSet = I18N.set.bind(I18N);
  I18N.set = (l) => { origSet(l); syncRunLabel(); refreshChipLabels(); if (state.user) $("welcome").textContent = `${I18N.t("app.welcome")}, ${state.user.name || state.user.email}`; };
}

function refreshChipLabels() {
  const apply = (wrap, options) => {
    if (!wrap) return;
    wrap.querySelectorAll(".chip").forEach((c) => {
      const o = options.find((x) => x.id === c.dataset.id);
      if (!o) return;
      c.textContent = I18N.lang === "vi" ? o.id : o.en;
      c.title = I18N.lang === "vi" ? o.vi : o.d_en;
    });
  };
  apply($("voiceChips"), VOICE_OPTIONS);
  apply($("moodChips"), MOOD_OPTIONS);
}

function buildStyleChips() {
  const sWrap = $("styleChips");
  STYLE_OPTIONS.forEach((s) => {
    const c = document.createElement("div");
    c.className = "chip"; c.textContent = s;
    c.onclick = () => {
      if (state.styles.has(s)) { state.styles.delete(s); c.classList.remove("on"); }
      else { state.styles.add(s); c.classList.add("on"); }
      updateRunState();
    };
    sWrap.appendChild(c);
  });
  buildSingleSelect($("voiceChips"), VOICE_OPTIONS, "voice");
  buildSingleSelect($("moodChips"), MOOD_OPTIONS, "mood");
}

// single-select chip group (voice / mood) — click again to clear
function buildSingleSelect(wrap, options, key) {
  options.forEach((o) => {
    const c = document.createElement("div");
    c.className = "chip";
    c.textContent = I18N.lang === "vi" ? o.id : o.en;
    c.title = I18N.lang === "vi" ? o.vi : o.d_en;
    c.dataset.id = o.id;
    c.onclick = () => {
      const already = state[key] === o.id;
      wrap.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
      if (already) { state[key] = ""; }
      else { state[key] = o.id; c.classList.add("on"); }
      updateRunState();
    };
    wrap.appendChild(c);
  });
}

function selectTab(tab) {
  if ((tab === "refine" || tab === "variation" || tab === "timing") && !state.premium) {
    openPaywall();
    return;
  }
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === tab));
  $("refineWrap").style.display = tab === "refine" ? "block" : "none";
  $("variationWrap").style.display = tab === "variation" ? "block" : "none";
  $("timingWrap").style.display = tab === "timing" ? "block" : "none";
  syncRunLabel();
  updateRunState();
}

function syncRunLabel() {
  const map = { scan: "app.run1", refine: "app.run2", variation: "app.run3", timing: "app.run4" };
  $("runLabel").textContent = I18N.t(map[state.tab]);
}

function updateRunState() {
  let ready = !!state.audioBuffer && !state.busy;
  if (state.tab === "variation") ready = ready && state.styles.size > 0;
  $("runBtn").disabled = !ready;
}

// ---------------------------------------------------------------------
// Audio handling + DSP
// ---------------------------------------------------------------------
async function handleFile(file) {
  $("fileName").textContent = file.name;
  state.file = file;
  state.fileBase = (file.name || "track").replace(/\.[^.]+$/, "").slice(0, 64) || "track";
  const buf = await file.arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer;
  try { audioBuffer = await ac.decodeAudioData(buf.slice(0)); }
  catch (e) { toast("⚠ " + (I18N.lang === "vi" ? "Không đọc được file audio" : "Could not decode audio")); return; }

  state.audioBuffer = audioBuffer;
  drawWave(audioBuffer);
  state.dsp = computeDSP(audioBuffer);
  renderDSP(state.dsp);
  state.clipB64 = encodeClipBase64(audioBuffer, 60, 16000);
  updateRunState();
}

function drawWave(ab) {
  const host = $("wave");
  const c = document.createElement("canvas");
  const W = host.clientWidth || 480, H = 64;
  c.width = W * devicePixelRatio; c.height = H * devicePixelRatio;
  c.style.width = "100%"; c.style.height = H + "px";
  host.innerHTML = ""; host.appendChild(c);
  const x = c.getContext("2d"); x.scale(devicePixelRatio, devicePixelRatio);
  const data = ab.getChannelData(0);
  const step = Math.floor(data.length / W);
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "#FFB23E"); g.addColorStop(.5, "#FFD36E"); g.addColorStop(1, "#FF4D9D");
  x.fillStyle = g;
  for (let i = 0; i < W; i++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const v = data[i * step + j] || 0;
      if (v < min) min = v; if (v > max) max = v;
    }
    const y1 = (1 + min) * H / 2, y2 = (1 + max) * H / 2;
    x.fillRect(i, y1, 1, Math.max(1, y2 - y1));
  }
}

// ---- tiny iterative radix-2 FFT (in-place) ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

function computeDSP(ab) {
  const sr = ab.sampleRate;
  const L = ab.getChannelData(0);
  const R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L;
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2;

  return {
    durationSec: +ab.duration.toFixed(1),
    bpm: estimateBPM(mono, sr),
    key: estimateKey(mono, sr),
    stereo: estimateStereo(L, R, ab.numberOfChannels),
    bands: estimateBands(mono, sr),
  };
}

function estimateBPM(mono, sr) {
  const hop = 512;
  const frames = Math.floor(mono.length / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let j = 0; j < hop; j++) { const v = mono[f * hop + j] || 0; s += v * v; }
    env[f] = Math.sqrt(s / hop);
  }
  // onset = positive difference
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, env[f] - env[f - 1]);
  const envRate = sr / hop;
  let best = 0, bestBpm = 120;
  for (let bpm = 60; bpm <= 180; bpm++) {
    const lag = Math.round((60 / bpm) * envRate);
    let sum = 0, cnt = 0;
    for (let f = lag; f < frames; f++) { sum += onset[f] * onset[f - lag]; cnt++; }
    const score = cnt ? sum / cnt : 0;
    if (score > best) { best = score; bestBpm = bpm; }
  }
  return bestBpm;
}

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const KRUMHANSL_MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const KRUMHANSL_MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

function estimateKey(mono, sr) {
  const N = 8192;
  const chroma = new Float32Array(12);
  const total = mono.length;
  const windows = Math.min(40, Math.max(1, Math.floor(total / N)));
  const stepW = Math.floor(total / windows);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let wi = 0; wi < windows; wi++) {
    const off = wi * stepW;
    for (let i = 0; i < N; i++) {
      const s = mono[off + i] || 0;
      const han = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = s * han; im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N;
      if (f < 55 || f > 5000) continue;
      const mag = Math.hypot(re[k], im[k]);
      const pc = ((Math.round(12 * Math.log2(f / 16.3516)) % 12) + 12) % 12; // C0=16.35Hz
      chroma[pc] += mag;
    }
  }
  // normalize
  let mx = 0; for (const v of chroma) mx = Math.max(mx, v);
  if (mx > 0) for (let i = 0; i < 12; i++) chroma[i] /= mx;

  let best = -Infinity, bestKey = "C major";
  for (let tonic = 0; tonic < 12; tonic++) {
    let cMaj = 0, cMin = 0;
    for (let i = 0; i < 12; i++) {
      cMaj += chroma[(i + tonic) % 12] * KRUMHANSL_MAJ[i];
      cMin += chroma[(i + tonic) % 12] * KRUMHANSL_MIN[i];
    }
    if (cMaj > best) { best = cMaj; bestKey = NOTE_NAMES[tonic] + " major"; }
    if (cMin > best) { best = cMin; bestKey = NOTE_NAMES[tonic] + " minor"; }
  }
  return bestKey;
}

function estimateBands(mono, sr) {
  const N = 8192;
  const re = new Float32Array(N), im = new Float32Array(N);
  const total = mono.length;
  const windows = Math.min(30, Math.max(1, Math.floor(total / N)));
  const stepW = Math.floor(total / windows);
  const edges = [20, 60, 250, 2000, 6000, 16000];
  const acc = [0, 0, 0, 0, 0];
  for (let wi = 0; wi < windows; wi++) {
    const off = wi * stepW;
    for (let i = 0; i < N; i++) {
      const s = mono[off + i] || 0;
      const han = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = s * han; im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N;
      const mag = re[k] * re[k] + im[k] * im[k];
      for (let b = 0; b < 5; b++) {
        if (f >= edges[b] && f < edges[b + 1]) { acc[b] += mag; break; }
      }
    }
  }
  const mx = Math.max(...acc, 1e-9);
  const norm = acc.map((v) => +(v / mx).toFixed(3));
  return { sub: norm[0], low: norm[1], mid: norm[2], high: norm[3], air: norm[4] };
}

function estimateStereo(L, R, ch) {
  if (ch < 2) return 0;
  let mid = 0, side = 0;
  const n = Math.min(L.length, sampleCap(L.length));
  for (let i = 0; i < n; i++) {
    const m = (L[i] + R[i]) / 2, s = (L[i] - R[i]) / 2;
    mid += m * m; side += s * s;
  }
  const w = side / (mid + side + 1e-9);
  return +Math.min(1, w * 2).toFixed(2);
}
function sampleCap(len) { return Math.min(len, 44100 * 30); }

function renderDSP(d) {
  $("dspPanel").style.display = "grid";
  $("dBpm").textContent = d.bpm;
  $("dKey").textContent = d.key;
  $("dStereo").textContent = d.stereo;
  const host = $("dBands"); host.innerHTML = "";
  ["sub","low","mid","high","air"].forEach((k) => {
    const s = document.createElement("span");
    s.style.height = Math.max(8, d.bands[k] * 40) + "px";
    s.title = k;
    host.appendChild(s);
  });
}

// ---- encode trimmed mono 16k WAV → base64 (for Gemini) ----
function encodeClipBase64(ab, maxSec, targetSr) {
  const srcSr = ab.sampleRate;
  const L = ab.getChannelData(0);
  const R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L;
  const srcLen = Math.min(L.length, Math.floor(srcSr * maxSec));
  const ratio = targetSr / srcSr;
  const outLen = Math.floor(srcLen * ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i / ratio;
    const i0 = Math.floor(srcIdx), i1 = Math.min(srcLen - 1, i0 + 1);
    const frac = srcIdx - i0;
    const m0 = (L[i0] + R[i0]) / 2, m1 = (L[i1] + R[i1]) / 2;
    let s = m0 + (m1 - m0) * frac;
    s = Math.max(-1, Math.min(1, s));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  // WAV header
  const buf = new ArrayBuffer(44 + out.length * 2);
  const v = new DataView(buf);
  const ws = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + out.length * 2, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, targetSr, true); v.setUint32(28, targetSr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, out.length * 2, true);
  for (let i = 0; i < out.length; i++) v.setInt16(44 + i * 2, out[i], true);
  // base64
  let bin = ""; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------------------------------------------------------------------
// Analyze
// ---------------------------------------------------------------------
async function runAnalyze() {
  if (state.busy || !state.audioBuffer) return;
  if (state.tab === "timing") return runTiming();

  state.busy = true; updateRunState();
  const btn = $("runBtn"), label = $("runLabel").textContent;
  btn.innerHTML = `<span class="spinner"></span><span>${I18N.t("app.analyzing")}</span>`;

  const payload = {
    mode: state.tab,
    lang: I18N.lang,
    dsp: state.dsp,
    audio: state.clipB64 ? { mime: "audio/wav", data: state.clipB64 } : null,
    context: {
      prompt: state.tab === "refine" ? $("refinePrompt").value : undefined,
      styles: state.tab === "variation" ? Array.from(state.styles) : undefined,
      voice: state.tab === "variation" ? state.voice || undefined : undefined,
      mood: state.tab === "variation" ? state.mood || undefined : undefined,
    },
  };

  const { ok, status, data } = await Auth.api("/api/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  state.busy = false;
  btn.innerHTML = `<span id="runLabel">${label}</span>`;
  updateRunState();

  if (!ok) {
    if (status === 403 || status === 429) {
      toast(data?.message || "Limit reached");
      openPaywall();
    } else {
      toast(data?.message || (I18N.lang === "vi" ? "Có lỗi xảy ra, thử lại" : "Something went wrong"));
    }
    return;
  }

  $("modelTag").textContent = data.model || "";
  renderMarkdown($("result"), data.text);
  await refreshUsage();
}

// ---------------------------------------------------------------------
// Tab 4 — Timing Lyrics (Whisper -> Gemini, via Supabase Storage)
// ---------------------------------------------------------------------
async function runTiming() {
  if (state.busy || !state.file) return;
  if (!state.premium) { openPaywall(); return; }

  state.busy = true; updateRunState();
  const btn = $("runBtn"), label = $("runLabel").textContent;
  const setStage = (txt) => { btn.innerHTML = `<span class="spinner"></span><span>${txt}</span>`; };
  setStage(I18N.t("app.upStage"));

  try {
    // 1) upload the audio to the user's own folder in Storage
    const ext = (state.file.name.split(".").pop() || "mp3").toLowerCase().slice(0, 5);
    const path = `${state.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await window.sb.storage
      .from("audio")
      .upload(path, state.file, { contentType: state.file.type || "audio/mpeg", upsert: false });
    if (up.error) throw new Error(up.error.message);

    // 2) ask the server to run Whisper + Gemini
    setStage(I18N.t("app.timingStage"));
    const { ok, status, data } = await Auth.api("/api/timing", {
      method: "POST",
      body: JSON.stringify({
        storagePath: path,
        mime: state.file.type || "audio/mpeg",
        lang: I18N.lang,
        dsp: state.dsp,
      }),
    });

    if (!ok) {
      if (status === 403) { toast(data?.message || "Premium required"); openPaywall(); }
      else toast(data?.message || (I18N.lang === "vi" ? "Lỗi tạo timing, thử lại" : "Timing failed, retry"));
      return;
    }

    $("modelTag").textContent =
      (data.model || "") + (data.whisper ? " · Whisper" : "");
    renderTiming(data.timed || "", data.suno || "");
  } catch (e) {
    toast((I18N.lang === "vi" ? "Lỗi: " : "Error: ") + (e.message || e));
  } finally {
    state.busy = false;
    btn.innerHTML = `<span id="runLabel">${label}</span>`;
    updateRunState();
  }
}

// Render the two output formats with copy + .lrc download.
function renderTiming(timed, suno) {
  const host = $("result");
  host.innerHTML = "";

  const block = (titleKey, content, opts = {}) => {
    const card = document.createElement("div");
    card.style.cssText = "margin-bottom:18px";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap";
    const h = document.createElement("strong");
    h.style.cssText = "font-family:var(--font-display);font-size:15px";
    h.textContent = I18N.t(titleKey);
    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:8px";

    const copy = document.createElement("button");
    copy.className = "copy-btn";
    copy.textContent = I18N.t("app.copy");
    copy.onclick = () => {
      navigator.clipboard.writeText(content);
      copy.textContent = I18N.t("app.copied");
      setTimeout(() => (copy.textContent = I18N.t("app.copy")), 1400);
    };
    btns.appendChild(copy);

    if (opts.lrc) {
      const dl = document.createElement("button");
      dl.className = "copy-btn";
      dl.textContent = I18N.t("app.downloadLrc");
      dl.onclick = () => downloadLrc(content);
      btns.appendChild(dl);
    }

    head.appendChild(h); head.appendChild(btns);
    const pre = document.createElement("pre");
    pre.style.cssText = "background:#0a0718;border:1px solid var(--line);border-radius:var(--r-sm);padding:14px;overflow:auto;font-family:var(--font-mono);font-size:13px;color:var(--ink);white-space:pre-wrap";
    pre.textContent = content || "—";
    card.appendChild(head); card.appendChild(pre);
    return card;
  };

  host.appendChild(block("app.timedTitle", timed, { lrc: true }));
  if (suno) host.appendChild(block("app.sunoTitle", suno));
}

// Convert "[MM:SS] line" -> "[mm:ss.00] line" and download as .lrc
function downloadLrc(timed) {
  const lrc = timed
    .split("\n")
    .map((l) => l.replace(/^\s*\[(\d{1,2}):(\d{2})\]/, (_, m, s) => `[${m.padStart(2, "0")}:${s}.00]`))
    .join("\n");
  const blob = new Blob([lrc], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${state.fileBase || "track"}.lrc`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(I18N.lang === "vi" ? "Đã tải file .lrc" : "Downloaded .lrc");
}

// ---------------------------------------------------------------------
// Minimal markdown → HTML with copyable code blocks
// ---------------------------------------------------------------------
function renderMarkdown(host, md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = [];
  md = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = "cb" + blocks.length;
    blocks.push(code.trim());
    return `\n@@CODE${id}@@\n`;
  });

  let html = esc(md)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!`)`([^`]+)`(?!`)/g, "<code>$1</code>")
    .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
  html = "<p>" + html + "</p>";

  html = html.replace(/@@CODE(cb\d+)@@/g, (_, id) => {
    const idx = +id.replace("cb", "");
    return `<div class="codeblock"><button class="copy-btn" data-code="${idx}">${I18N.t("app.copy")}</button><pre>${esc(blocks[idx])}</pre></div>`;
  });

  host.innerHTML = html;
  host.querySelectorAll(".copy-btn").forEach((b) => {
    b.onclick = () => {
      navigator.clipboard.writeText(blocks[+b.dataset.code]);
      b.textContent = I18N.t("app.copied");
      setTimeout(() => (b.textContent = I18N.t("app.copy")), 1400);
    };
  });
}

// ---------------------------------------------------------------------
// Paywall + PayPal
// ---------------------------------------------------------------------
let paypalLoaded = false;
function openPaywall() {
  $("payModal").classList.add("show");
  if (paypalLoaded) return;
  paypalLoaded = true;
  const s = document.createElement("script");
  s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.PAYPAL_CLIENT_ID)}&vault=true&intent=subscription&locale=en_US`;
  s.onload = renderPayPal;
  s.onerror = () => toast("PayPal SDK failed to load");
  document.body.appendChild(s);
}

function renderPayPal() {
  if (!window.paypal) return;
  window.paypal.Buttons({
    style: { shape: "pill", color: "blue", layout: "vertical", label: "subscribe" },
    createSubscription: (data, actions) =>
      actions.subscription.create({
        plan_id: cfg.PAYPAL_PLAN_ID,
        custom_id: state.user?.id || "",
      }),
    onApprove: async (data) => {
      toast(I18N.lang === "vi" ? "Đang kích hoạt Premium…" : "Activating Premium…");
      const res = await Auth.api("/api/activate", {
        method: "POST",
        body: JSON.stringify({ subscriptionID: data.subscriptionID }),
      });
      if (res.ok && res.data?.premium) {
        $("payModal").classList.remove("show");
        toast(I18N.lang === "vi" ? "🎉 Đã nâng cấp Premium!" : "🎉 You're Premium now!");
        await refreshUsage();
      } else {
        toast(I18N.lang === "vi" ? "Kích hoạt lỗi — liên hệ hỗ trợ" : "Activation failed — contact support");
      }
    },
    onError: () => toast("PayPal error"),
  }).render("#paypal-button-container");
}

// ---------------------------------------------------------------------
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3200);
}
})();
