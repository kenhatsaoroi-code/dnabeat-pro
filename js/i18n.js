// =====================================================================
// i18n.js — VI/EN. Default VI. Persisted in localStorage.
// Usage: <h1 data-i18n="hero.title"></h1>  then I18N.apply()
// =====================================================================
const STRINGS = {
  vi: {
    "nav.features": "Tính năng",
    "nav.pricing": "Bảng giá",
    "nav.demo": "Demo",
    "nav.login": "Đăng nhập Google",
    "nav.open": "Mở Tool",

    "hero.eyebrow": "MUSIC DNA v3 · NGHE NHẠC THẬT BẰNG AI",
    "hero.title": "Giải mã DNA của mọi bản nhạc",
    "hero.sub": "Tải lên một đoạn nhạc — AI thực sự nghe, phân tích thể loại, BPM, key, nhạc cụ, cấu trúc, rồi tạo prompt Suno chuẩn để bạn tái tạo hoặc biến tấu.",
    "hero.cta": "Bắt đầu với Google",
    "hero.cta2": "Xem demo",
    "hero.note": "Miễn phí 5 lượt/ngày · Không cần thẻ",

    "feat.title": "Bốn chế độ trong MUSIC DNA v3",
    "feat.1.t": "Quét & Tạo Prompt",
    "feat.1.d": "AI nghe bản nhạc, bóc tách thể loại/mood/nhạc cụ và xuất prompt Suno sẵn sàng copy.",
    "feat.2.t": "Tinh chỉnh 99%",
    "feat.2.d": "So khớp prompt với bản tham chiếu tới ~99% — sửa BPM, key, mix, instrumentation.",
    "feat.3.t": "Biến tấu Style",
    "feat.3.d": "Giữ DNA cốt lõi, đổi style + giọng hát + mood — mỗi style một prompt riêng.",
    "feat.4.t": "Timing Lyrics",
    "feat.4.d": "Thả nguyên bài hát, AI tự nghe (Whisper + Gemini) và xuất lời kèm mốc thời gian từng dòng + bản dán thẳng vào Suno.",
    "feat.badge.free": "Miễn phí",
    "feat.badge.premium": "Premium",

    "demo.title": "Xem tool hoạt động",
    "demo.sub": "Video demo 90 giây — từ upload đến prompt hoàn chỉnh.",
    "demo.placeholder": "Video demo · sắp ra mắt",

    "price.title": "Một giá. Mở khoá tất cả.",
    "price.free.t": "Free",
    "price.free.p": "$0",
    "price.free.1": "5 lượt phân tích / ngày",
    "price.free.2": "Tab Quét & Tạo Prompt",
    "price.free.3": "Song ngữ VI/EN",
    "price.free.cta": "Đăng nhập miễn phí",
    "price.pro.t": "Premium",
    "price.pro.per": "/tháng",
    "price.pro.1": "Phân tích KHÔNG giới hạn",
    "price.pro.2": "Mở khoá cả 4 tab",
    "price.pro.3": "Tinh chỉnh 99% + Biến tấu + Timing Lyrics",
    "price.pro.4": "Ưu tiên model AI",
    "price.pro.cta": "Nâng cấp Premium",
    "price.pro.tag": "Phổ biến nhất",

    "foot.rights": "Bảo lưu mọi quyền.",

    // app
    "app.tagline": "Giải mã & tái tạo DNA âm nhạc",
    "app.upgrade": "Nâng cấp",
    "app.logout": "Đăng xuất",
    "app.tab1": "Quét & Tạo Prompt",
    "app.tab2": "Tinh chỉnh 99%",
    "app.tab3": "Biến tấu Style",
    "app.tab4": "Timing Lyric",
    "app.locked": "Premium",
    "app.drop": "Kéo thả file nhạc vào đây",
    "app.drop2": "hoặc bấm để chọn · mp3, wav, m4a",
    "app.analyzing": "Đang phân tích…",
    "app.run1": "Quét & Tạo Prompt",
    "app.run2": "Tinh chỉnh tới 99%",
    "app.run3": "Tạo biến tấu",
    "app.run4": "Tạo Timing Lyric (.lrc)",
    "app.downloadLrc": "⬇ Tải file .lrc",
    "app.dsp": "Phân tích DSP",
    "app.result": "Kết quả",
    "app.empty": "Tải nhạc lên và bấm phân tích để xem DNA.",
    "app.copy": "Sao chép",
    "app.copied": "Đã chép!",
    "app.refinePrompt": "Dán prompt hiện tại để tinh chỉnh…",
    "app.pickStyles": "Chọn style mục tiêu:",
    "app.pickVoice": "Giọng hát (chọn 1):",
    "app.pickMood": "Mood / cảm xúc (chọn 1):",
    "app.timingHint": "Thả nguyên bài hát → AI tự nghe (Whisper + Gemini), xuất 2 bản: lời kèm mốc [MM:SS] và lời sạch dán thẳng vào Suno. Hỗ trợ đa ngôn ngữ.",
    "app.timedTitle": "Lời kèm mốc thời gian [MM:SS]",
    "app.sunoTitle": "Lời sẵn cho Suno",
    "app.upStage": "Đang tải nhạc lên…",
    "app.timingStage": "Đang nghe & căn lời…",
    "app.limitTitle": "Hết lượt hôm nay",
    "app.upsell": "Nâng cấp Premium để dùng không giới hạn và mở khoá cả 3 tab.",
    "app.remaining": "Còn lại hôm nay",
    "app.unlimited": "Không giới hạn",
    "app.payTitle": "Nâng cấp Premium — $10/tháng",
    "app.paySub": "Thanh toán an toàn qua PayPal · hỗ trợ thẻ Visa/Mastercard",
    "app.payClose": "Đóng",
    "app.welcome": "Xin chào",
  },
  en: {
    "nav.features": "Features",
    "nav.pricing": "Pricing",
    "nav.demo": "Demo",
    "nav.login": "Sign in with Google",
    "nav.open": "Open Tool",

    "hero.eyebrow": "MUSIC DNA v3 · AI THAT ACTUALLY LISTENS",
    "hero.title": "Decode the DNA of any track",
    "hero.sub": "Drop in a clip — the AI truly listens, reads genre, BPM, key, instruments and structure, then writes a clean Suno prompt so you can recreate or remix it.",
    "hero.cta": "Start with Google",
    "hero.cta2": "Watch demo",
    "hero.note": "5 free runs/day · No card needed",

    "feat.title": "Four modes in MUSIC DNA v3",
    "feat.1.t": "Scan & Prompt",
    "feat.1.d": "AI listens, extracts genre/mood/instruments and outputs a copy-ready Suno prompt.",
    "feat.2.t": "Refine to 99%",
    "feat.2.d": "Match your prompt to a reference at ~99% — fix BPM, key, mix and instrumentation.",
    "feat.3.t": "Style Variation",
    "feat.3.d": "Keep the core DNA, swap style + vocal + mood — a prompt per style.",
    "feat.4.t": "Timing Lyrics",
    "feat.4.d": "Drop a full song; the AI listens (Whisper + Gemini) and outputs line-by-line timed lyrics plus a paste-into-Suno version.",
    "feat.badge.free": "Free",
    "feat.badge.premium": "Premium",

    "demo.title": "See it in action",
    "demo.sub": "A 90-second walkthrough — from upload to finished prompt.",
    "demo.placeholder": "Demo video · coming soon",

    "price.title": "One price. Unlock everything.",
    "price.free.t": "Free",
    "price.free.p": "$0",
    "price.free.1": "5 analyses / day",
    "price.free.2": "Scan & Prompt tab",
    "price.free.3": "Bilingual VI/EN",
    "price.free.cta": "Sign in free",
    "price.pro.t": "Premium",
    "price.pro.per": "/month",
    "price.pro.1": "UNLIMITED analyses",
    "price.pro.2": "All 4 tabs unlocked",
    "price.pro.3": "Refine 99% + Variation + Timing Lyrics",
    "price.pro.4": "Priority AI model",
    "price.pro.cta": "Go Premium",
    "price.pro.tag": "Most popular",

    "foot.rights": "All rights reserved.",

    "app.tagline": "Decode & recreate music DNA",
    "app.upgrade": "Upgrade",
    "app.logout": "Sign out",
    "app.tab1": "Scan & Prompt",
    "app.tab2": "Refine 99%",
    "app.tab3": "Style Variation",
    "app.tab4": "Timing Lyric",
    "app.locked": "Premium",
    "app.drop": "Drag & drop an audio file",
    "app.drop2": "or click to choose · mp3, wav, m4a",
    "app.analyzing": "Analyzing…",
    "app.run1": "Scan & build prompt",
    "app.run2": "Refine to 99%",
    "app.run3": "Generate variations",
    "app.run4": "Generate Timing Lyric (.lrc)",
    "app.downloadLrc": "⬇ Download .lrc",
    "app.dsp": "DSP analysis",
    "app.result": "Result",
    "app.empty": "Upload audio and run an analysis to see the DNA.",
    "app.copy": "Copy",
    "app.copied": "Copied!",
    "app.refinePrompt": "Paste your current prompt to refine…",
    "app.pickStyles": "Pick target styles:",
    "app.pickVoice": "Vocal (pick 1):",
    "app.pickMood": "Mood / emotion (pick 1):",
    "app.timingHint": "Drop a full song → the AI listens (Whisper + Gemini) and returns two versions: lyrics with [MM:SS] timestamps and clean lyrics to paste into Suno. Multi-language.",
    "app.timedTitle": "Timed lyrics [MM:SS]",
    "app.sunoTitle": "Suno-ready lyrics",
    "app.upStage": "Uploading audio…",
    "app.timingStage": "Listening & aligning…",
    "app.limitTitle": "Out of runs today",
    "app.upsell": "Go Premium for unlimited runs and all 3 tabs.",
    "app.remaining": "Left today",
    "app.unlimited": "Unlimited",
    "app.payTitle": "Go Premium — $10/month",
    "app.paySub": "Secure checkout via PayPal · Visa/Mastercard supported",
    "app.payClose": "Close",
    "app.welcome": "Welcome",
  },
};

const I18N = {
  lang: "en",
  t(key) {
    return (STRINGS[this.lang] && STRINGS[this.lang][key]) || STRINGS.vi[key] || key;
  },
  set(lang) {
    this.lang = lang === "en" ? "en" : "vi";
    localStorage.setItem("dnabeat_lang", this.lang);
    document.documentElement.lang = this.lang;
    this.apply();
    document.querySelectorAll("[data-lang-btn]").forEach((b) => {
      b.classList.toggle("on", b.dataset.langBtn === this.lang);
    });
  },
  apply() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = this.t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.placeholder = this.t(el.dataset.i18nPh);
    });
  },
};
window.I18N = I18N;
