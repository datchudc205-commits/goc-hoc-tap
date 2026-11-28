"""Kiểm thử 004_tu_chon_bai.sql (em tự chọn môn lấy bài) trên Postgres thật.
Dùng: python tests/test_v4.py supabase/schema.sql supabase/002_nang_cap.sql supabase/003_thuong_phat.sql supabase/004_tu_chon_bai.sql"""
import json, sys, tempfile, uuid
import pgserver, psycopg

srv = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="stop")
conn = psycopg.connect(srv.get_uri(), autocommit=True)
cur = conn.cursor()
cur.execute("""
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create schema extensions;
create function extensions.gen_salt(t text) returns text language sql volatile as $$ select '$fake$' || substr(md5(random()::text), 1, 8) || '$' $$;
create function extensions.crypt(p text, s text) returns text language sql immutable as
  $$ select substring(s from '^(\\$fake\\$[^$]*\\$)') || md5(substring(s from '^(\\$fake\\$[^$]*\\$)') || p) $$;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb,
  encrypted_password text, last_sign_in_at timestamptz, banned_until timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
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
cur.execute("grant usage on schema public to service_role")
print(f"{len(sys.argv) - 1} file SQL chạy 2 lần OK")

passed = 0
def ok(c, label):
    global passed
    if not c: raise AssertionError("FAIL: " + label)
    passed += 1; print("  ✔", label)
def admin(): cur.execute("reset role"); cur.execute("select set_config('request.jwt.claim.sub', '', false)")
def as_user(u):
    admin(); cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (str(u),)); cur.execute("set role authenticated")
def as_server(): admin(); cur.execute("set role service_role")
def err(fn, frag, label):
    try: fn()
    except psycopg.Error as e:
        ok(frag.lower() in str(e).lower(), f"{label} → '{frag}'"); return
    raise AssertionError("FAIL (không lỗi): " + label)
def one(q, *a): cur.execute(q, a); return cur.fetchone()
def signup(email, meta):
    admin(); u = uuid.uuid4()
    cur.execute("insert into auth.users (id, email, raw_user_meta_data) values (%s,%s,%s)", (u, email, json.dumps(meta))); return u
def bal(u): admin(); return one("select coalesce(sum(amount),0) from star_events where student_id=%s", u)[0]

T = signup("anh@gmail.com", {"role": "teacher", "full_name": "Anh"})
code = one("select invite_code from profiles where id=%s", T)[0]
S = signup("bena@hocsinh.example", {"role": "student", "full_name": "Bé", "invite_code": code})
L = signup("le@hocsinh.example", {"role": "student", "full_name": "Lẻ", "invite_code": code})
admin(); cur.execute("update profiles set teacher_id = null where id=%s", (L,))   # người giao bài đã bị xoá
X = signup("la@gmail.com", {"role": "teacher", "full_name": "Lạ"})

QS = [{"type": "mcq", "prompt": "2+2=?", "options": ["3", "4"], "accepted": ["1"], "explanation": "2+2=4", "points": 1},
      {"type": "short", "prompt": "3×3=?", "accepted": ["9"], "points": 1}]
def payload(title="Em tự chọn · Toán · 28/11", qs=QS):
    return json.dumps({"title": title, "subject": "Toán", "instructions": "AI soạn", "questions": qs})
def create(student, qs=QS):
    as_server(); return one("select create_self_assignment(%s, %s)", student, payload(qs=qs))[0]
def reason(student): as_server(); return one("select self_assign_block_reason(%s)", student)[0]
def finish(aid):
    as_user(S); sid = one("select start_submission(%s)", aid)[0]
    qids = [r[0] for r in (cur.execute("select id from questions where assignment_id=%s order by position", (aid,)) or cur.fetchall())]
    cur.execute("select save_answer(%s,%s,'1','{}')", (sid, qids[0])); cur.execute("select save_answer(%s,%s,'9','{}')", (sid, qids[1]))
    return one("select submit_submission(%s)", sid)[0]

print("\n1. Ai được gọi")
as_user(S); err(lambda: cur.execute("select create_self_assignment(%s, %s)", (S, payload())), "permission denied", "học sinh KHÔNG gọi thẳng được (không tự chèn đáp án)")
as_user(S); err(lambda: cur.execute("select self_assign_block_reason(%s)", (S,)), "permission denied", "học sinh không gọi thẳng hàm kiểm tra")
admin(); cur.execute("set role anon"); err(lambda: cur.execute("select create_self_assignment(%s, %s)", (S, payload())), "permission denied", "người chưa đăng nhập không gọi được")
ok(reason(S) is None, "bé chưa có bài nào → được lấy bài")
ok("người giao bài" in reason(L), "học sinh chưa có người giao bài → không lấy được")
ok("học sinh" in reason(T).lower(), "người giao bài không dùng nút của học sinh")

print("\n2. Tạo bài")
a1 = create(S)
admin()
row = one("select teacher_id, student_id, published, self_chosen, subject, due_at > now(), (due_at at time zone interval '+07:00')::date = (now() at time zone interval '+07:00')::date from assignments where id=%s", a1)
ok(row[0] == T and row[1] == S, "bài thuộc về anh (người giao bài) và giao cho bé")
ok(row[2] and row[3] and row[4] == "Toán", "giao luôn (published), đánh dấu em tự chọn, đúng môn")
ok(row[5] and row[6], "hạn nộp là cuối ngày hôm nay giờ Việt Nam")
ok(one("select count(*) from questions where assignment_id=%s", a1)[0] == 2, "đủ 2 câu hỏi")
as_user(S); ok(one("select count(*) from assignments where id=%s", a1)[0] == 1, "bé thấy bài trên trang")
as_user(S); ok(one("select count(*) from question_keys qk join questions q on q.id = qk.question_id where q.assignment_id=%s", a1)[0] == 0, "bé KHÔNG đọc được đáp án trước khi nộp")
as_user(T); ok(one("select count(*) from assignments where id=%s", a1)[0] == 1, "anh thấy bài em tự chọn")
as_user(X); ok(one("select count(*) from assignments where id=%s", a1)[0] == 0, "người lạ không thấy")

print("\n3. Giới hạn")
ok("chưa làm xong" in reason(S), "còn bài chưa làm → không lấy thêm")
err(lambda: create(S), "chưa làm xong", "máy chủ cũng chặn khi còn bài chưa làm")
st = finish(a1)
ok(st == "returned", "bài trắc nghiệm + điền đáp án chấm tự động ngay khi nộp")
ok(bal(S) == 1 + 3, f"nộp đúng hạn +1, điểm 10 +3 → {bal(S)} sao")
ok(reason(S) is None, "làm xong → lấy được bài thứ 2")
a2 = create(S); finish(a2)
ok("2 bài" in reason(S), "đã tự lấy 2 bài hôm nay → hết lượt")
err(lambda: create(S), "2 bài", "máy chủ chặn bài thứ 3 trong ngày")
admin(); cur.execute("update assignments set created_at = now() - interval '1 day' where self_chosen")
ok(reason(S) is None, "sang ngày mới → lấy lại được")
as_user(T); cur.execute("select save_assignment(%s)", (json.dumps({"title": "Anh giao", "student_id": str(S), "published": True, "questions": QS}),))
ok("chưa làm xong" in reason(S), "anh vừa giao bài → bé làm bài anh giao trước")

print("\n4. Dữ liệu sai")
admin(); cur.execute("delete from assignments where student_id=%s", (S,))
err(lambda: create(S, qs=[]), "ít nhất 1 câu", "không có câu hỏi → lỗi")
err(lambda: create(S, qs=[{"type": "photo", "prompt": "chụp"}]), "không hợp lệ", "không cho loại câu nộp ảnh")
err(lambda: create(S, qs=[{"type": "mcq", "prompt": "x", "options": ["a", "b"], "accepted": ["5"]}]), "phương án đúng", "trắc nghiệm sai chỉ số đáp án → lỗi")
admin(); ok(one("select count(*) from assignments where student_id=%s", S)[0] == 0, "lỗi thì không để lại bài dở")
a3 = create(S, qs=[{"type": "short", "prompt": "x", "accepted": ["1"], "points": 99}])
admin(); ok(one("select points from questions where assignment_id=%s", a3)[0] == 5, "điểm mỗi câu tối đa 5")

print(f"\nĐẠT {passed} kiểm tra")
srv.cleanup()
