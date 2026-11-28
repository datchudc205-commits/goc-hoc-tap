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
   Mặc định app dùng `gemini-3.5-flash-lite`; nếu model đó quá tải hoặc không có, app tự thử `gemini-3.1-flash-lite`, `gemini-3.6-flash`, rồi `gemini-flash-latest`.

Khóa chỉ nằm trên máy chủ Supabase (trong `supabase/functions/ai/index.ts`), **không bao giờ** gửi xuống trình duyệt của em.

### Sửa code AI

Code nằm ở `supabase/functions/ai/index.ts`. Sau khi sửa, vào Supabase → **Edge Functions → ai → Code**, dán code mới rồi bấm **Deploy**.
Cài đặt *Verify JWT with legacy secret* để **tắt**, vì hàm đã tự kiểm tra đăng nhập và vai trò.

---

## Nâng cấp 2 – Quản trị, mục lục SGK lớp 6, kiểm tra bài trên lớp, giao diện mới

**Cài đặt (đã làm sẵn trên project hiện tại):**

1. Supabase → SQL Editor → dán toàn bộ `supabase/002_nang_cap.sql` → Run (chạy **sau** `schema.sql`).
2. Cấp quyền admin cho tài khoản của bạn:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'email-cua-ban@gmail.com');
   ```
3. Cài lại Edge Function `ai` bằng code mới trong `supabase/functions/ai/index.ts`.

**Tính năng mới:**

- **Quản trị** (chỉ admin thấy): thống kê toàn hệ thống; danh sách mọi tài khoản kèm tên đăng nhập, vai trò, lớp, lần đăng nhập gần nhất; sửa vai trò, lớp, người giao bài; **đặt lại mật khẩu**; khoá hoặc mở khoá; xoá tài khoản.
- **Học sinh** (người giao bài): xem **tên đăng nhập** của các em, đổi lớp, **đặt lại mật khẩu** cho em trong vài giây.
- **Mục lục SGK lớp 6 – Kết nối tri thức với cuộc sống** (`js/curriculum.js`): Toán, Ngữ văn, Tiếng Anh (Global Success), KHTN, Lịch sử và Địa lí, GDCD, Tin học, Công nghệ.
  - Khi giao bài, chọn **Môn → Chương → Bài**. App tự đặt tên bài và điền sẵn chủ đề cho **AI soạn đề**.
- **Kiểm tra bài trên lớp**: em (hoặc bạn) chụp ảnh vở bài làm ở trường.
  - AI đọc chữ viết tay, kiểm tra **từng bài đúng/sai**, đưa lời giải đúng và ước lượng điểm.
  - Bạn xem rồi viết nhận xét.
- **Giao diện mới**: thanh điều hướng bên trái (trên điện thoại là menu ☰), thẻ số liệu, bảng biểu, trang đăng nhập 2 cột.
- **Đăng nhập**:
  - Có nút 👁 để xem mật khẩu đang gõ.
  - Báo lỗi kèm cách khắc phục.
  - Có mục "Quên mật khẩu?".
  - Đăng xuất chỉ thoát trên thiết bị đang dùng.

## Nâng cấp 3 – Thời gian làm bài, sao thưởng, thử thách nhỏ, gợi ý cách làm

**Cài đặt (đã làm sẵn trên project hiện tại):**

1. Supabase → SQL Editor → dán toàn bộ `supabase/003_thuong_phat.sql` → Run (chạy **sau** `002_nang_cap.sql`).
2. Cài lại Edge Function `ai` bằng code mới trong `supabase/functions/ai/index.ts` (có thêm phần "hint").

**Tính năng mới:**

- **Thời gian làm bài**: khi soạn bài, chọn 10–90 phút hoặc tự nhập.
  - Em thấy màn hình "Bắt đầu làm bài". Bấm Bắt đầu thì đồng hồ chạy.
  - Còn 5 phút và 1 phút có nhắc. Hết giờ bài **tự nộp**.
  - Máy chủ cũng khoá việc lưu bài sau khi hết giờ (cho dư 1 phút), nên em không "lách" được.
  - Khi em đang làm, trang chấm bài có nút **Thêm 10 phút**. Đồng hồ của em tự cập nhật trong vòng 30 giây.
- **Sao ⭐ tự động**: +1 nộp đúng hạn; +1/+2/+3 theo điểm (từ 5, từ 7, từ 9 trở lên).
  - Nộp muộn bị −1. Số sao **không bao giờ âm**.
- **Thưởng / nhắc nhở** (trang *Thưởng & thử thách*): khen thưởng +1 đến +5 sao kèm lý do. Nhắc nhở nhẹ tối đa −3.
- **Cửa hàng phần thưởng**: bạn tự đặt quà và giá sao.
  - Em bấm "Đổi quà" → bạn duyệt thì mới trừ sao, hoặc bấm "Để sau" để từ chối.
- **Thử thách nhỏ thay cho hình phạt**: ví dụ đọc sách 15 phút, làm lại câu sai, dọn góc học tập.
  - Em báo "đã làm xong" → bạn xác nhận thì em được cộng sao, hoặc nhờ em làm lại.
  - Khi chấm một bài nộp muộn hoặc dưới 5 điểm, app gợi ý giao thử thách.
- **💡 Gợi ý cách làm**: em bấm khi không hiểu câu nào. Mỗi câu có tối đa 3 mức:
  1. Hiểu đề
  2. Các bước làm
  3. Ví dụ tương tự với số khác
  - AI **không được xem đáp án** và được dặn không giải hộ. Các gợi ý em đã xin hiện trên trang chấm bài.

## Không đăng nhập được? (báo "Sai tên đăng nhập hoặc mật khẩu")

1. **Tắt bộ gõ tiếng Việt** (Unikey/EVKey) khi gõ mật khẩu. Trên điện thoại, chuyển bàn phím sang tiếng Anh. Bấm 👁 để xem mình đang gõ gì.
2. **Học sinh** đăng nhập bằng **tên đăng nhập** (VD: `baongan`), **không phải** tên hiển thị ("Bảo Ngân").
3. **Người giao bài** đăng nhập bằng **đúng email đã dùng khi tạo tài khoản**. Admin xem được email này trong trang Quản trị.
4. Vẫn không được → người giao bài vào **Học sinh → Đặt lại mật khẩu** (cho em), hoặc admin vào **Quản trị → 🔑** (cho bất kỳ ai).

**Kiểm thử:**
- `tests/test_upgrade.py`: 35 kiểm tra cơ sở dữ liệu.
- `tests/e2e_v2.py`: 16 kiểm tra trên Supabase thật, gồm cả AI kiểm tra ảnh bài trên lớp.

---

## Em tự chọn môn để lấy bài (nâng cấp 4)

Khi em đã làm hết bài, trang chính của em hiện ô **"Hôm nay chưa có bài? Em chọn môn muốn làm"**. Em chọn môn (có thể chọn thêm chương/bài) rồi bấm **Lấy bài**: AI soạn 6 câu trắc nghiệm và điền đáp án, giao luôn cho em, hạn nộp cuối ngày. Nộp xong em thấy điểm ngay, sao được cộng như bài thường.

- Mỗi ngày em tự lấy được tối đa **2 bài** (đổi số trong hàm `self_assign_daily_limit` ở `supabase/004_tu_chon_bai.sql`).
- Còn bài chưa làm (kể cả bài bạn giao) thì chưa lấy thêm được.
- Bài có tên `Em tự chọn · <môn> · <ngày>`, bạn xem và xoá được như bài thường.
- Em không xem được đáp án: đề được lưu ngay trên máy chủ.

**Cài (làm một lần):**
1. Supabase → **SQL Editor** → dán toàn bộ `supabase/004_tu_chon_bai.sql` → **Run**.
2. Supabase → **Edge Functions → ai → Code** → dán `supabase/functions/ai/index.ts` mới → **Deploy**.
3. Đưa các file của trang lên lại (GitHub Pages).

Kiểm thử: `python tests/test_v4.py supabase/schema.sql supabase/002_nang_cap.sql supabase/003_thuong_phat.sql supabase/004_tu_chon_bai.sql`

## Nâng cấp 5 – Ảnh đề bài khi kiểm tra bài trên lớp, Góc trò chơi

**Cài đặt (đã làm sẵn trên project hiện tại):**

1. Supabase → SQL Editor → dán toàn bộ `supabase/005_de_bai_tro_choi.sql` → Run. Chạy **sau** `004_tu_chon_bai.sql`.
2. Cài lại Edge Function `ai` bằng code trong `supabase/functions/ai/index.ts`. Code mới có thêm `scan_problem` và `game_quiz`.

**Ảnh đề bài (menu "Kiểm tra bài trên lớp"):**

- Khi gửi bài có 2 phần: **① Ảnh đề bài** (trang sách, phiếu bài tập; tối đa 4 ảnh, nên có) và **② Ảnh bài làm**.
- AI chạy 2 bước:
  1. **Đọc đề** từ ảnh đề.
  2. **Chấm bài trong vở theo đúng đề đó.** Bài nào em chưa làm được đánh dấu "Chưa làm".
- Trên trang kết quả có thể:
  - xem đề AI đã đọc;
  - **Sửa đề** nếu AI đọc nhầm số, rồi bấm "Kiểm tra lại";
  - **Đọc lại đề**, hoặc **thêm / đổi ảnh đề** cho bài đã gửi.

**Góc trò chơi (menu "Góc trò chơi"):**

- 6 trò: 🎈 Bắn bóng bay, 🃏 Lật thẻ tìm cặp, ⚡ Nhanh tay 60 giây, ✅ Đúng hay Sai, 🔤 Xếp chữ, 🏁 Đua về đích (thi với rô-bốt).
- Nội dung chơi:
  - **Toán 6** tự sinh: 7 chủ đề, mỗi lượt câu hỏi mới.
  - **Từ vựng Tiếng Anh 6**: 12 Unit.
  - **Ôn bài đã làm**: lấy từ bài anh đã trả. Trang kết quả bài có nút "Ôn lại bằng trò chơi".
  - **AI theo bài học**: tối đa 15 lần/ngày.
- Chơi xong, app hiện lại các câu em làm sai để ôn.
- Đúng từ 80% (ít nhất 8 câu) thì được **+1 ⭐**. Số sao tối đa mỗi ngày do anh chọn (mặc định 2).
- Trang của anh: xem em đã chơi gì, đúng bao nhiêu và chọn số sao tối đa mỗi ngày. Có thể bật **"Làm xong bài mới được chơi"** để khoá trò chơi khi em còn bài chưa nộp. Có nút **Chơi thử**.
