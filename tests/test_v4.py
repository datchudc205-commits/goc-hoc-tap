"""Kiểm thử 004_de_bai_tro_choi.sql (ảnh đề bài, góc trò chơi, giới hạn AI) trên Postgres thật.
Dùng: python tests/test_v3.py supabase/schema.sql supabase/002_nang_cap.sql supabase/003_thuong_phat.sql supabase/004_de_bai_tro_choi.sql"""
import json, sys, tempfile, uuid
import pgserver, psycopg

srv = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="stop")
conn = psycopg.connect(srv.get_uri(), autocommit=True)
cur = conn.cursor()
cur.execute("""
create role anon nologin; create role authenticated nologin;
create schema auth; create schema extensions;
create function extensions.gen_salt(t text) returns text language sql volatile as $$ select '$fake$' || substr(md5(random()::text), 1, 8) || '$' $$;
create function extensions.crypt(p text, s text) returns text language sql immutable as
  $$ select substring(s from '^(\\$fake\\$[^$]*\\$)') || md5(substring(s from '^(\\$fake\\$[^$]*\\$)') || p) $$;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb,
  encrypted_password text, last_sign_in_at timestamptz, banned_until timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated; grant select, insert, delete on storage.objects to authenticated;
""")
for f in sys.argv[1:]:
    sql = open(f, encoding="utf-8").read(); cur.execute(sql); cur.execute(sql)
print(f"{len(sys.argv)-1} file SQL chạy 2 lần OK")

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
    cur.execute("insert into auth.users (id, email, raw_user_meta_data) values (%s,%s,%s)", (u, email, json.dumps(meta))); return u
def bal(u): admin(); return one("select coalesce(sum(amount),0) from star_events where student_id=%s", u)[0]

T = signup("anh@gmail.com", {"role": "teacher", "full_name": "Anh"})
code = one("select invite_code from profiles where id=%s", T)[0]
S = signup("bena@hocsinh.example", {"role": "student", "full_name": "Bé", "invite_code": code})
X = signup("la@gmail.com", {"role": "teacher", "full_name": "Lạ"})


print("\n1. Ảnh đề bài")
as_user(S)
cw = one("select create_classwork(%s,'Toán','Bài 5','', %s, %s)", S, [f"{S}/lop-1/1.jpg"], [f"{S}/lop-1/de-1.jpg"])[0]
ok(one("select problem_paths from classwork where id=%s", cw)[0] == [f"{S}/lop-1/de-1.jpg"], "gửi bài kèm ảnh đề")
err(lambda: cur.execute("select create_classwork(%s,'Toán','','', %s, %s)", (S, [f"{S}/a/1.jpg"], [f"{T}/a/de.jpg"])), "không hợp lệ", "ảnh đề ngoài thư mục của em")
err(lambda: cur.execute("select create_classwork(%s,'Toán','','', %s, %s)", (S, [f"{S}/a/1.jpg"], [f"{S}/a/d{i}.jpg" for i in range(5)])), "tối đa 4", "quá 4 ảnh đề")
cw0 = one("select create_classwork(%s,'Toán','','', %s, %s)", S, [f"{S}/b/1.jpg"], None)[0]
ok(one("select problem_paths from classwork where id=%s", cw0)[0] == [], "không có ảnh đề vẫn gửi được")
cur.execute("select save_classwork_problems(%s, %s)", (cw, json.dumps([{"label": "Bài 1", "text": "Tính 2+3"}])))
ok(one("select problems->0->>'text' from classwork where id=%s", cw)[0] == "Tính 2+3", "lưu đề AI đọc được")
err(lambda: cur.execute("select save_classwork_problems(%s, %s)", (cw, json.dumps({"a": 1}))), "không hợp lệ", "đề sai định dạng")
as_user(T)
cur.execute("select set_classwork_problem_images(%s, %s)", (cw, [f"{S}/lop-1/de-2.jpg"]))
ok(one("select problems is null from classwork where id=%s", cw)[0], "anh thay ảnh đề → xoá đề cũ để đọc lại")
as_user(X)
err(lambda: cur.execute("select set_classwork_problem_images(%s, %s)", (cw, [])), "không tìm thấy", "người lạ không sửa được")
err(lambda: cur.execute("select save_classwork_problems(%s, '[]')", (cw,)), "không tìm thấy", "người lạ không lưu đề được")

print("\n2. Trò chơi")
as_user(S)
st = one("select game_status()")[0]
ok(st["locked"] is False and st["cap"] == 2 and st["stars_today"] == 0, "mặc định: không khoá, tối đa 2 sao/ngày")
b0 = bal(S); as_user(S)
ok(one("select finish_game('Bóng bay','Toán',120,9,10,60)")[0] == 1, "đúng 9/10 → +1 sao")
ok(bal(S) == b0 + 1, "sao vào sổ"); as_user(S)
ok(one("select finish_game('Bóng bay','Toán',50,5,10,60)")[0] == 0, "đúng 5/10 → không sao")
ok(one("select finish_game('Lật thẻ','Toán',50,6,6,60)")[0] == 0, "ít hơn 8 câu → không sao")
ok(one("select finish_game('Nhanh tay','Toán',50,10,10,5)")[0] == 0, "chơi quá nhanh (<15 giây) → không sao")
ok(one("select finish_game('Đúng sai','Toán',50,10,10,45)")[0] == 1, "lượt tốt thứ 2 → +1 sao")
ok(one("select finish_game('Đúng sai','Toán',50,10,10,45)")[0] == 0, "đã đủ 2 sao hôm nay → không thêm")
ok(one("select finish_game('x','y',1,999,5,10)")[0] == 0 and one("select correct from game_sessions order by created_at desc limit 1")[0] == 5, "số câu đúng bị giới hạn ≤ tổng")
as_user(T)
err(lambda: cur.execute("select finish_game('a','b',1,1,1,1)"), "chỉ học sinh", "người giao bài không lưu kết quả chơi")
ok(len(rows("select id from game_sessions where student_id=%s", S)) == 7, "anh xem được em đã chơi gì")
as_user(X)
ok(len(rows("select id from game_sessions")) == 0, "người lạ không xem được")
err(lambda: cur.execute("select save_game_settings(true, 9)"), "từ 0 đến 5", "giới hạn sao 0–5")

print("\n3. Khoá trò chơi khi chưa làm bài")
as_user(T)
cur.execute("select save_game_settings(true, 3)")
aid = one("select save_assignment(%s)", json.dumps({"title": "Bài về nhà", "student_id": str(S), "published": True,
      "questions": [{"type": "short", "prompt": "1+1", "accepted": ["2"], "points": 1}]}))[0]
as_user(S)
st = one("select game_status()")[0]
ok(st["locked"] and st["pending"] >= 1 and st["cap"] == 3, "còn bài chưa nộp → khoá")
err(lambda: cur.execute("select finish_game('a','b',1,1,1,30)"), "làm xong bài", "đang khoá thì không lưu lượt chơi")
sub = one("select start_submission(%s)", aid)[0]
cur.execute("select submit_submission(%s)", (sub,))
ok(one("select game_status()")[0]["locked"] is False, "nộp bài xong → mở khoá")

print("\n4. Giới hạn AI")
as_user(S)
for i in range(3): cur.execute("select use_ai('game', 3)")
err(lambda: cur.execute("select use_ai('game', 3)"), "hết 3 lượt", "quá số lượt AI trong ngày")
admin(); err(lambda: cur.execute("select use_ai('game', 3)"), "đăng nhập", "chưa đăng nhập thì không dùng")

print(f"\nTẤT CẢ {passed} KIỂM TRA ĐỀU ĐẠT")
