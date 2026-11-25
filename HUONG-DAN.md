# Góc Học Tập – Hướng dẫn cài đặt

App giao bài và chấm bài online cho 2 vai trò:

- **Người giao bài (bạn):** soạn bài (tự gõ hoặc tạo nhanh đề toán), giao bài có hạn nộp, chấm bài tự luận và ảnh chụp, nhận xét, xem tiến độ học tập.
- **Học sinh (em):** xem bài cần làm, làm bài trên điện thoại (tự lưu khi đang làm), chụp ảnh bài làm trong vở để nộp, xem điểm, lời giải và nhận xét.

Trắc nghiệm và điền đáp án được **chấm tự động** ngay khi em nộp. Nếu bài chỉ có hai loại câu này, em thấy điểm luôn. Bài có câu tự luận hoặc câu nộp ảnh sẽ chờ bạn chấm.

Bản hiện tại **chưa dùng AI**. Phần Gemini được mô tả ở cuối file.

---

## Bước 1 – Tạo cơ sở dữ liệu miễn phí (Supabase, khoảng 5 phút)

1. Vào https://supabase.com → **Start your project** → đăng nhập (có thể dùng tài khoản GitHub hoặc Google).
2. Bấm **New project**. Đặt tên tùy ý (VD: `goc-hoc-tap`), đặt mật khẩu database, chọn khu vực **Singapore** cho gần Việt Nam → **Create**.
3. Khi project tạo xong, mở **SQL Editor** ở menu trái → **New query**.
4. Mở file `supabase/schema.sql`, chép **toàn bộ** nội dung, dán vào ô truy vấn rồi bấm **Run**. Thấy báo *Success* là xong.
5. Mở **Authentication → Sign In / Providers → Email**, **tắt "Confirm email"** rồi lưu.
   Bước này để em đăng ký được bằng *tên đăng nhập* (VD: `bena`), không cần email thật.

## Bước 2 – Kết nối app với cơ sở dữ liệu

1. Trong Supabase, vào **Project Settings → API** (hoặc **API Keys**).
2. Chép **Project URL** và khóa công khai (**anon public**, hoặc **publishable key** ở giao diện mới).
3. Mở file `js/config.js` và điền vào:

```js
export const SUPABASE_URL = 'https://abcxyz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

> Khóa *anon/publishable* được phép để công khai trong app. Dữ liệu được bảo vệ bằng phân quyền (RLS): mỗi người chỉ xem được đúng phần của mình.
> **Tuyệt đối không** dán khóa `service_role` hay `secret` vào app.

## Bước 3 – Đưa app lên mạng để em mở được từ xa

App chỉ gồm các file tĩnh (HTML/JS/CSS), **không cần build**. Chọn một trong các cách sau:

- **Netlify Drop (dễ nhất):** vào https://app.netlify.com/drop, đăng nhập, kéo cả thư mục `goc-hoc-tap` vào. Bạn sẽ nhận được link dạng `https://ten-gi-do.netlify.app`.
- **Vercel / Cloudflare Pages / GitHub Pages:** cũng chạy được, chỉ cần trỏ vào thư mục này.

Mỗi lần sửa code, bạn chỉ cần kéo thả thư mục lên lại.

**Chạy thử trên máy trước khi đưa lên mạng** (cần có Python):

```powershell
py -m http.server 5173 --directory goc-hoc-tap
```

Sau đó mở http://localhost:5173 trên trình duyệt.

## Bước 4 – Bắt đầu dùng

1. **Bạn** mở link → **Tạo tài khoản** → chọn **Người giao bài** → đăng ký bằng email của bạn.
2. Trang chính hiện **mã mời** gồm 6 ký tự. Bấm **Chép tin nhắn mời** rồi gửi cho em qua Zalo.
3. **Em** mở link → **Tạo tài khoản** → chọn **Học sinh** → đặt tên đăng nhập, mật khẩu và nhập mã mời.
4. Bạn bấm **+ Giao bài mới**. Mục **🧮 Tạo nhanh đề toán** sinh sẵn các phép cộng, trừ, nhân, chia.
5. Bấm **Giao bài cho em**. Khi em nộp bài, trang chính báo **"Có N bài đang chờ bạn chấm"**.

**Cài như app trên điện thoại:** mở link bằng Chrome (Android) hoặc Safari (iPhone) → menu → **Thêm vào màn hình chính**.

---

## Cấu trúc thư mục

```
goc-hoc-tap/
├─ index.html              trang chính
├─ css/style.css           giao diện
├─ js/config.js            ← ĐIỀN URL + KHÓA SUPABASE Ở ĐÂY
├─ js/main.js              khởi động, đăng nhập, điều hướng trang
├─ js/auth.js              đăng nhập / đăng ký / mã mời
├─ js/teacher.js           màn hình người giao bài: danh sách, soạn bài, chấm bài, tiến độ
├─ js/student.js           màn hình học sinh: danh sách, làm bài, kết quả
├─ js/mathgen.js           sinh đề toán tự động
├─ js/image.js             thu nhỏ ảnh trước khi tải lên
├─ js/db.js, js/ui.js      tiện ích dùng chung
├─ supabase/schema.sql     cơ sở dữ liệu + phân quyền + hàm chấm điểm
└─ tests/test_schema.py    kiểm thử tự động cho schema.sql (48 kiểm tra)
```

**Bảo mật:** mọi thao tác ghi quan trọng (lưu bài, nộp bài, chấm điểm) chạy bằng hàm trên máy chủ, nên:

- Em không đọc được đáp án trước khi bài được trả.
- Em không tự sửa được điểm.
- Bài đã nộp thì không sửa được nữa.
- Người lạ không xem được bài hay ảnh của em.

## Giới hạn hiện tại

- Chưa có thông báo đẩy. Em cần mở app để thấy bài mới, hoặc bạn nhắn Zalo cho em.
- Bài mà em đã mở thì không sửa câu hỏi được nữa. Hãy dùng **Nhân bản** để tạo bài mới từ bài đó.
- Xóa bài tập không xóa ảnh đã tải lên. Ảnh vẫn nằm trong Storage, bạn có thể dọn tay.
- Gói Supabase miễn phí có thể **tạm dừng project nếu lâu không dùng**. Khi đó vào trang Supabase bấm *Restore* là chạy lại.

---

## AI Gemini

App có 3 tính năng AI. Chỉ **người giao bài** dùng được, và mọi kết quả AI đều chờ bạn duyệt:

- **✨ AI soạn đề** (trong màn hình *Giao bài mới*): nhập chủ đề, lớp, độ khó, số câu → AI đổ câu hỏi vào bài. Bạn đọc lại, sửa rồi mới giao.
- **✨ AI gợi ý chấm** (trong màn hình *Chấm bài*): AI đọc bài tự luận, **ảnh chụp bài làm**, và câu điền bị máy chấm sai, rồi điền sẵn điểm và nhận xét. Câu AI không chắc được đánh dấu ⚠. Bạn vẫn là người bấm **Trả bài**.
- **✨ AI soạn bài luyện** (trong trang *Tiến độ*): lấy các câu em làm sai gần đây để soạn bài luyện mới.

### Cài khóa Gemini (làm một lần)

1. Vào https://aistudio.google.com/apikey → đăng nhập Google → **Create API key** → chép khóa.
2. Vào Supabase → **Edge Functions → Secrets** → *Name*: `GEMINI_API_KEY`, *Value*: dán khóa vừa chép → **Save**.
3. (Không bắt buộc) Muốn đổi model thì thêm secret `GEMINI_MODEL`, VD: `gemini-3.5-flash-lite`.
   Mặc định app dùng `gemini-3.5-flash-lite`; nếu model này không có, app tự chuyển sang `gemini-flash-latest`.

Khóa chỉ nằm trên máy chủ Supabase (trong `supabase/functions/ai/index.ts`), **không bao giờ** gửi xuống trình duyệt của em.

### Sửa code AI

Code nằm ở `supabase/functions/ai/index.ts`. Sau khi sửa, vào Supabase → **Edge Functions → ai → Code**, dán code mới rồi bấm **Deploy**.
Cài đặt *Verify JWT with legacy secret* để **tắt**, vì hàm đã tự kiểm tra đăng nhập và vai trò.
