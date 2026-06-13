# 🧬 DNAbeat.pro — Music DNA Analyzer SaaS

SaaS phân tích "DNA âm nhạc": quét nhạc thật bằng Gemini + DSP, tạo prompt SUNO, tinh chỉnh 99%, biến tấu style (14 style · 8 voice · 8 mood), và **Timing Lyrics** (Whisper + Gemini → lời kèm mốc thời gian + bản dán Suno). Login Google (Supabase), giới hạn lượt (free 5/ngày), nâng cấp Premium $10/tháng qua PayPal.

> **Kiến trúc:** static site (không cần build) + Vercel serverless functions. Key Gemini, OpenAI và mọi secret **chỉ nằm ở backend** (Vercel env vars), không bao giờ lộ ra client.

---

## 0. Cấu trúc thư mục

```
dnabeat-pro/
├── index.html            landing page
├── app.html              tool MUSIC DNA v3
├── css/style.css
├── js/
│   ├── config.js         CHỈ chứa key public (Supabase anon, PayPal client id)
│   ├── i18n.js  auth.js  fx.js  app.js
├── api/                  serverless (chạy trên Vercel)
│   ├── analyze.js        Tab 1-3 · gọi Gemini + chặn quyền + đếm lượt
│   ├── timing.js         Tab 4 · Whisper (OpenAI) → Gemini · timed + Suno lyrics
│   ├── usage.js          trả về quota
│   ├── activate.js       xác minh sub PayPal → bật premium
│   ├── paypal-webhook.js tự động bật/tắt premium
│   ├── _lib.js  _paypal.js   (file dùng chung, KHÔNG phải route)
├── supabase/schema.sql   chạy 1 lần trong Supabase (bảng + RLS + bucket 'audio')
├── vercel.json  package.json  .env.example
```

---

## 1. Supabase — tạo database (1 phút)

1. Vào **Supabase → SQL Editor → New query**.
2. Dán toàn bộ nội dung `supabase/schema.sql` → **Run**.
   - Tạo bảng `profiles` + `usage`, trigger tự tạo profile khi user đăng ký, RPC `increment_usage`, RLS, và **bucket Storage `audio`** (riêng tư) dùng cho Tab 4 Timing Lyrics.
3. Vào **Authentication → URL Configuration**:
   - **Site URL:** `https://dnabeat.pro`
   - **Redirect URLs:** thêm `https://dnabeat.pro` và `https://dnabeat.pro/app`
   - (Khi test local thì thêm cả `http://localhost:3000`.)
4. Google OAuth đã bật sẵn rồi (Client ID có trong config). Không cần làm gì thêm.

> Lấy **service_role key**: Supabase → **Project Settings → API → service_role** (secret). Dùng ở bước 3 — **tuyệt đối không** đưa key này vào code/js.

---

## 2. Gemini API key (miễn phí)

1. Vào https://aistudio.google.com/apikey → **Create API key**.
2. Copy key (dạng `AIza...`). Dùng ở bước 4.

---

## 2b. OpenAI Whisper key (cho Tab 4 — Timing Lyrics)

Tab 4 chạy 2 tầng: **Whisper** bóc lời + mốc thời gian → **Gemini** nghe lại, sửa lời sai, chia Intro/Verse/Chorus và xuất 2 bản (timed + Suno-ready).

1. Vào https://platform.openai.com/api-keys → **Create new secret key**.
2. Copy key (dạng `sk-...`). Dùng ở bước 4.

> Whisper ≈ $0.006/phút (bài 4 phút ≈ $0.024). Nếu **không** đặt key này, Tab 4 vẫn chạy bằng Gemini-only (timing kém chính xác hơn).

---

## 3. PayPal — secret + webhook

Bạn đã có **Client ID** + **Plan ID** ($10/tháng). Cần thêm:

1. **Secret:** PayPal Developer → **Apps & Credentials** → mở app → copy **Secret** (live).
2. **Webhook:** trong app đó → **Add Webhook**
   - URL: `https://dnabeat.pro/api/paypal-webhook`
   - Chọn events: `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `PAYMENT.SALE.COMPLETED`
   - Lưu → copy **Webhook ID**.

---

## 4. Deploy lên Vercel

1. Push thư mục này lên GitHub (hoặc kéo thả vào Vercel).
2. Vercel → **New Project** → import repo. **Framework Preset = Other** (không build gì cả).
3. Vào **Settings → Environment Variables**, thêm (tất cả để **Production**):

| Tên | Giá trị |
|---|---|
| `GEMINI_API_KEY` | key Gemini ở bước 2 |
| `OPENAI_API_KEY` | key Whisper ở bước 2b (cho Tab 4) |
| `SUPABASE_URL` | `https://ynyfvszgxhmldjnlcmcy.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (bước 1) |
| `PAYPAL_CLIENT_ID` | `AWi9P8SawyFUKD_g8vjK6jfjxiOnjMzYj7qwiDQsCQldRiZOC7ieKkAA_LWNRD8HMisVRJ1vc_n6Jxq-` |
| `PAYPAL_CLIENT_SECRET` | secret (bước 3) |
| `PAYPAL_WEBHOOK_ID` | webhook id (bước 3) |
| `PAYPAL_ENV` | `live` |
| `FREE_DAILY_LIMIT` | `5` |

4. **Deploy**. Xong sẽ có bản chạy ở `*.vercel.app` để test trước.

---

## 5. Trỏ domain dnabeat.pro

1. Vercel → **Settings → Domains** → add `dnabeat.pro`.
2. Vercel hiện bản ghi DNS → vào nhà cung cấp domain set theo (thường `A @ 76.76.21.21` + `CNAME www`).
3. Chờ DNS xanh → quay lại **bước 1.3** đảm bảo Redirect URLs của Supabase đã có domain thật.

---

## 6. Test checklist

- [ ] Mở `dnabeat.pro` → bấm **Đăng nhập Google** → quay lại có avatar.
- [ ] Vào tool → kéo file nhạc → thấy waveform + BPM/Key/Stereo (DSP chạy ngay ở client).
- [ ] Bấm **Quét** (tab 1) → Gemini trả prompt. Lượt đếm tăng.
- [ ] Free: tab 2/3/4 khóa, hết 5 lượt → hiện paywall.
- [ ] Bấm **Nâng cấp** → PayPal → thanh toán → tự bật Premium, mở khóa full 4 tab + unlimited.
- [ ] Tab 4: thả 1 bài hát (Premium) → ra **lời kèm mốc [MM:SS]** + **bản dán Suno**, tải được file `.lrc`.

---

## Phân quyền

| | Free | Premium ($10/mo) |
|---|---|---|
| Lượt/ngày | 5 | ∞ |
| Tab 1 Quét & Prompt | ✅ | ✅ |
| Tab 2 Tinh chỉnh 99% | 🔒 | ✅ |
| Tab 3 Biến tấu Style (14 style · 8 voice · 8 mood) | 🔒 | ✅ |
| Tab 4 Timing Lyrics (Whisper + Gemini) | 🔒 | ✅ |

## Chi phí / lượt (tham khảo)

- Gemini (nghe + phân tích): ~$0.03–0.05
- Whisper (Tab 4): ~$0.006/phút → bài 4 phút ≈ $0.024
- Mỗi user Premium ~$5–8/tháng · thu $10 → lãi ~$2–5/user

## Bảo mật

- Client chỉ giữ key **public** (Supabase anon, PayPal client id). 
- Mọi request `/api/*` gửi kèm JWT Supabase; serverless verify JWT bằng service_role rồi mới gọi Gemini/Whisper → **key Gemini & OpenAI không bao giờ ra client**.
- Tab 4: client upload nhạc vào bucket `audio` riêng tư (RLS theo `user.id`); server tải về bằng service role, xử lý xong **tự xoá** file. Cách này né luôn giới hạn body 4.5MB của Vercel nên hỗ trợ trọn bài.
- Chặn quyền + đếm lượt làm ở server, client không lách được.
