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

## Giai đoạn 2 – Thêm Gemini (kế hoạch)

Khóa Gemini **phải để trên máy chủ**, không để trong `js/`. Dự kiến làm như sau:

1. Tạo một **Supabase Edge Function** tên `ai`, lưu `GEMINI_API_KEY` trong phần *Secrets* của Supabase.
2. **✨ AI soạn đề** (trong màn hình soạn bài): nhập chủ đề, lớp và số câu. Gemini trả về danh sách câu hỏi **đúng định dạng** mà `save_assignment` đang dùng (`type`, `prompt`, `options`, `accepted`, `explanation`, `points`). Câu hỏi được đổ vào trình soạn bài để bạn duyệt và sửa trước khi giao.
3. **✨ AI gợi ý chấm** (trong màn hình chấm bài): gửi ảnh hoặc bài tự luận kèm đáp án mẫu. Gemini điền sẵn điểm và nhận xét vào ô chấm, **bạn vẫn bấm "Trả bài"** để xác nhận.
4. **Gợi ý bài luyện:** đưa danh sách "Câu em làm sai gần đây" (đã có ở trang Tiến độ) cho Gemini để ra bài luyện đúng chỗ yếu.

Cơ sở dữ liệu hiện tại đã đủ cho các bước này, không cần sửa bảng.
