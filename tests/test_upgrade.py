"""Kiểm thử schema.sql + 002_nang_cap.sql trên Postgres thật (pgserver).
Dùng: python tests/test_upgrade.py supabase/schema.sql supabase/002_nang_cap.sql"""
import json, sys, tempfile, uuid
import pgserver, psycopg

srv = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="stop")
conn = psycopg.connect(srv.get_uri(), autocommit=True)
cur = conn.cursor()
cur.execute("""
create role anon nologin; create role authenticated nologin;
create schema auth; create schema extensions;
-- pgserver không có pgcrypto → hàm thay thế cùng tính chất crypt(p, hash) = hash (Supabase thật dùng bcrypt)
create function extensions.gen_salt(t text) returns text language sql volatile as
  $$ select '$fake$' || substr(md5(random()::text), 1, 8) || '$' $$;
create function extensions.crypt(p text, s text) returns text language sql immutable as
  $$ select substring(s from '^(\\$fake\\$[^$]*\\$)') || md5(substring(s from '^(\\$fake\\$[^$]*\\$)') || p) $$;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb,
  encrypted_password text, last_sign_in_at timestamptz, banned_until timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
""")
for f in sys.argv[1:]:
    sql = open(f, encoding="utf-8").read()
    cur.execute(sql); cur.execute(sql)
print("schema + nâng cấp chạy 2 lần OK")

passed = 0
def ok(c, label):
    global passed
    if not c: raise AssertionError("FAIL: " + label)
    passed += 1; print("  ✔", label)
def admin(): cur.execute("reset role"); cur.execute("select set_config('request.jwt.claim.sub', '', false)")
def as_user(u):
    admin(); cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (str(u),)); cur.execute("set role authenticated")
def err(fn, frag, label):
    try: fn()
    except psycopg.Error as e:
        ok(frag.lower() in str(e).lower(), f"{label} → '{frag}'"); return
    raise AssertionError("FAIL (không lỗi): " + label)
def one(q, *a): cur.execute(q, a); return cur.fetchone()
def rows(q, *a): cur.execute(q, a); return cur.fetchall()
def signup(email, meta):
    admin(); u = uuid.uuid4()
    cur.execute("insert into auth.users (id, email, raw_user_meta_data, encrypted_password) values (%s,%s,%s, extensions.crypt('cu123456', extensions.gen_salt('bf')))",
                (u, email, json.dumps(meta)))
    return u

A = signup("anh@gmail.com", {"role": "teacher", "full_name": "Anh"})
code = one("select invite_code from profiles where id=%s", A)[0]
B = signup("bena@hocsinh.example", {"role": "student", "full_name": "Bé Na", "invite_code": code, "grade": "6"})
X = signup("la@gmail.com", {"role": "teacher", "full_name": "Người lạ"})
code2 = one("select invite_code from profiles where id=%s", X)[0]
Y = signup("hsla@hocsinh.example", {"role": "student", "full_name": "HS lạ", "invite_code": code2, "grade": "abc"})
admin()
ok(one("select grade from profiles where id=%s", B)[0] == 6, "lớp 6 được lưu khi đăng ký")
ok(one("select grade from profiles where id=%s", Y)[0] is None, "lớp không hợp lệ → bỏ trống, vẫn tạo được tài khoản")

print("\n1. Người giao bài quản lý học sinh")
as_user(A)
st = rows("select full_name, login, grade from my_students()")
ok(st == [("Bé Na", "bena", 6)], f"thấy học sinh + tên đăng nhập 'bena' {st}")
cur.execute("select reset_password(%s, 'moi123456')", (B,))
admin(); ok(one("select encrypted_password = extensions.crypt('moi123456', encrypted_password) from auth.users where id=%s", B)[0], "đặt lại mật khẩu cho bé (hash bcrypt đúng)")
as_user(A)
err(lambda: cur.execute("select reset_password(%s, 'abc123456')", (Y,)), "Không có quyền", "không đặt được mật khẩu học sinh người khác")
err(lambda: cur.execute("select reset_password(%s, 'abc')", (B,)), "ít nhất 6", "mật khẩu quá ngắn")
err(lambda: cur.execute("select reset_password(%s, 'abc123456')", (X,)), "Không có quyền", "người giao bài không đổi được mật khẩu người khác")
cur.execute("select set_student_grade(%s, 7)", (B,)); admin()
ok(one("select grade from profiles where id=%s", B)[0] == 7, "đổi lớp của bé")
as_user(B); err(lambda: cur.execute("select admin_stats()"), "Chỉ admin", "học sinh không xem được trang admin")
as_user(A); err(lambda: cur.execute("select * from admin_list_users()"), "Chỉ admin", "chưa là admin thì không xem được")

print("\n2. Admin")
admin(); cur.execute("update profiles set is_admin = true where id=%s", (A,))
as_user(A)
ok(len(rows("select * from admin_list_users()")) == 4, "admin thấy cả 4 tài khoản")
ok(len(rows("select * from profiles")) == 4, "admin đọc được mọi hồ sơ")
s = one("select admin_stats()")[0]
ok(s["teachers"] == 2 and s["students"] == 2, f"thống kê {s}")
cur.execute("select reset_password(%s, 'admin123')", (X,)); ok(True, "admin đặt lại mật khẩu bất kỳ ai")
cur.execute("select admin_set_banned(%s, true)", (X,)); admin()
ok(one("select banned_until > now() from auth.users where id=%s", X)[0], "admin khoá tài khoản")
as_user(A); ok(rows("select banned from admin_list_users() where id=%s", X)[0][0] is True, "danh sách hiện trạng thái bị khoá")
cur.execute("select admin_set_banned(%s, false)", (X,)); admin()
ok(one("select banned_until from auth.users where id=%s", X)[0] is None, "mở khoá")
as_user(A)
err(lambda: cur.execute("select admin_set_banned(%s, true)", (A,)), "tự khoá", "không tự khoá mình")
err(lambda: cur.execute("select admin_update_user(%s,'Anh','teacher',null,null,false)", (A,)), "tự bỏ quyền", "không tự bỏ quyền admin")
cur.execute("select admin_update_user(%s,'HS lạ (chuyển)','student',%s,6,false)", (Y, A)); admin()
ok(one("select teacher_id, grade, full_name from profiles where id=%s", Y)[0:3] == (A, 6, "HS lạ (chuyển)"), "chuyển học sinh sang người giao bài khác")
as_user(A)
err(lambda: cur.execute("select admin_update_user(%s,'x','student',null,null,false)", (X,)), "phải gắn", "học sinh phải có người giao bài")
cur.execute("select admin_delete_user(%s)", (X,)); admin()
ok(one("select count(*) from profiles where id=%s", X)[0] == 0, "xoá tài khoản (hồ sơ xoá theo)")

print("\n3. Kiểm tra bài trên lớp")
as_user(B)
img = f"{B}/lop-1/a.jpg"
cur.execute("insert into storage.objects (bucket_id, name) values ('bai-lam', %s)", (img,))
cw = one("select create_classwork(null, 'Toán', 'Bài 9. Dấu hiệu chia hết', 'bài trên lớp', %s)", [img])[0]
ok(cw is not None, "em tự gửi ảnh bài trên lớp")
err(lambda: cur.execute("select create_classwork(null,'Toán','', '', %s)", ([f"{A}/x.jpg"],)), "Ảnh không hợp lệ", "chặn ảnh của người khác")
err(lambda: cur.execute("select create_classwork(null,'Toán','', '', %s)", ([],)), "ít nhất 1 ảnh", "phải có ảnh")
cur.execute("select save_classwork_result(%s, %s, 8.25)", (cw, json.dumps({"items": []})))
r = one("select status, score from classwork where id=%s", cw)
ok(r[0] == "checked" and float(r[1]) in (8.2, 8.3), f"lưu kết quả AI {r}")
err(lambda: cur.execute("select review_classwork(%s,'x')", (cw,)), "Chỉ người giao bài", "em không tự nhận xét")
as_user(A)
img2 = f"{B}/lop-2/b.jpg"
cur.execute("insert into storage.objects (bucket_id, name) values ('bai-lam', %s)", (img2,))
ok(True, "người giao bài tải ảnh vào thư mục của bé")
cw2 = one("select create_classwork(%s, 'Ngữ văn', '', '', %s)", B, [img2])[0]
ok(cw2 is not None, "người giao bài gửi bài trên lớp hộ bé")
cur.execute("select review_classwork(%s,'Giỏi')", (cw,))
ok(len(rows("select id from classwork")) == 2, "người giao bài thấy 2 bài của bé")
as_user(Y)  # Y giờ là học sinh của A, nhưng không phải chủ bài
ok(len(rows("select id from classwork")) == 0, "học sinh khác không thấy bài của bé")
err(lambda: cur.execute("insert into storage.objects (bucket_id, name) values ('bai-lam', %s)", (f"{B}/z.jpg",)), "row-level", "học sinh khác không tải vào thư mục của bé")
as_user(B)
err(lambda: cur.execute("select delete_classwork(%s)", (cw2,)), "Không xoá được", "em không xoá được bài anh gửi")
cur.execute("select delete_classwork(%s)", (cw,))
ok(len(rows("select id from classwork")) == 1, "em xoá được bài em tự gửi")

print("\n4. Admin đọc dữ liệu học tập (chỉ đọc)")
as_user(A)
ok(len(rows("select * from classwork")) == 1, "admin/người giao bài đọc bài trên lớp")
print(f"\nTẤT CẢ {passed} KIỂM TRA ĐỀU ĐẠT")
