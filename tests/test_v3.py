"""Kiểm thử 003_thuong_phat.sql (thời gian làm bài, sao, phần thưởng, thử thách, gợi ý) trên Postgres thật.
Dùng: python tests/test_v3.py supabase/schema.sql supabase/002_nang_cap.sql supabase/003_thuong_phat.sql"""
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
print("3 file SQL chạy 2 lần OK")

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

def make(title, due=None, limit=None, qs=None):
    as_user(T)
    qs = qs or [{"type": "short", "prompt": "1+1", "accepted": ["2"], "points": 1}]
    aid = one("select save_assignment(%s)", json.dumps({"title": title, "student_id": str(S), "published": True, "due_at": due, "questions": qs}))[0]
    if limit: cur.execute("select set_time_limit(%s, %s)", (aid, limit))
    return aid

print("\n1. Thời gian làm bài")
a1 = make("Có giới hạn", limit=30)
admin(); ok(one("select time_limit_minutes from assignments where id=%s", a1)[0] == 30, "đặt giới hạn 30 phút")
as_user(X); err(lambda: cur.execute("select set_time_limit(%s, 10)", (a1,)), "Không tìm thấy", "người lạ không đổi được")
as_user(S); sub1 = one("select start_submission(%s)", a1)[0]
q1 = one("select id from questions where assignment_id=%s", a1)[0]
cur.execute("select save_answer(%s,%s,'2','{}')", (sub1, q1)); ok(True, "lưu được khi còn giờ")
as_user(T); err(lambda: cur.execute("select set_time_limit(%s, 10)", (a1,)), "Thêm giờ", "khoá đổi giới hạn khi em đã mở bài")
admin(); cur.execute("update submissions set started_at = now() - interval '35 minutes' where id=%s", (sub1,))
as_user(S); err(lambda: cur.execute("select save_answer(%s,%s,'3','{}')", (sub1, q1)), "hết giờ", "hết giờ → không lưu được nữa")
as_user(T); cur.execute("select add_extra_time(%s, 10)", (sub1,))
as_user(S); cur.execute("select save_answer(%s,%s,'2','{}')", (sub1, q1)); ok(True, "anh thêm 10 phút → em lưu tiếp được")
as_user(X); err(lambda: cur.execute("select add_extra_time(%s, 10)", (sub1,)), "không còn đang làm", "người lạ không thêm giờ được")

print("\n2. Sao tự động")
as_user(S); cur.execute("select submit_submission(%s)", (sub1,))
ok(bal(S) == 1 + 3, f"nộp đúng hạn +1 và điểm 10/10 +3 → {bal(S)} sao")
as_user(S); ok(len(rows("select * from star_events")) == 2, "em xem được lịch sử sao của mình")
a2 = make("Nộp muộn", due="2020-01-01T00:00:00Z")
as_user(S); s2 = one("select start_submission(%s)", a2)[0]; cur.execute("select submit_submission(%s)", (s2,))
ok(bal(S) == 4 - 1 + 0, f"nộp muộn −1, điểm 0 không cộng → {bal(S)} sao")
a3 = make("Điểm 7", qs=[{"type": "essay", "prompt": "Viết", "points": 10}])
as_user(S); s3 = one("select start_submission(%s)", a3)[0]; cur.execute("select submit_submission(%s)", (s3,))
q3 = one("select id from questions where assignment_id=%s", a3)[0]
as_user(T); cur.execute("select return_submission(%s,%s,'')", (s3, json.dumps([{"question_id": str(q3), "points": "7"}])))
ok(bal(S) == 3 + 1 + 2, f"đúng hạn +1, điểm 7 +2 → {bal(S)} sao")
as_user(T); cur.execute("select return_submission(%s,%s,'')", (s3, json.dumps([{"question_id": str(q3), "points": "10"}])))
ok(bal(S) == 6, "chấm lại không cộng sao lần 2")
# không để âm khi nộp muộn
Z = signup("hs2@hocsinh.example", {"role": "student", "full_name": "HS2", "invite_code": code})
as_user(T); a4 = one("select save_assignment(%s)", json.dumps({"title": "Muộn", "student_id": str(Z), "published": True, "due_at": "2020-01-01T00:00:00Z", "questions": [{"type": "short", "prompt": "x", "accepted": ["y"]}]}))[0]
as_user(Z); s4 = one("select start_submission(%s)", a4)[0]; cur.execute("select submit_submission(%s)", (s4,))
ok(bal(Z) == 0, "em chưa có sao thì nộp muộn không bị trừ xuống âm")

print("\n3. Thưởng / nhắc nhở bằng tay")
as_user(T); cur.execute("select give_stars(%s, 2, 'Chăm chỉ')", (S,)); ok(bal(S) == 8, "anh thưởng +2")
as_user(T); cur.execute("select give_stars(%s, -1, 'Quên mang vở')", (S,)); ok(bal(S) == 7, "nhắc nhở −1")
as_user(T); err(lambda: cur.execute("select give_stars(%s, -5, 'x')", (S,)), "1–3", "nhắc nhở tối đa −3")
as_user(T); err(lambda: cur.execute("select give_stars(%s, -1, 'x')", (Z,)), "chưa đủ sao", "không trừ khi em 0 sao")
as_user(S); err(lambda: cur.execute("select give_stars(%s, 5, 'tự thưởng')", (S,)), "Không phải", "em không tự thưởng được")
as_user(X); err(lambda: cur.execute("select give_stars(%s, 5, 'x')", (S,)), "Không phải", "người lạ không thưởng được")

print("\n4. Phần thưởng")
as_user(T)
r1 = one("insert into rewards (title, cost, icon) values ('30 phút xem TV', 5, '📺') returning id")[0]
r2 = one("insert into rewards (title, cost, icon) values ('Đi chơi', 100, '🎡') returning id")[0]
as_user(S); ok(len(rows("select * from rewards")) == 2, "em thấy cửa hàng phần thưởng")
err(lambda: cur.execute("insert into rewards (title, cost) values ('hack', 1)"), "row-level", "em không tự tạo phần thưởng")
err(lambda: cur.execute("select request_reward(%s)", (r2,)), "chưa đủ sao", "không đủ sao thì không xin đổi được")
req = one("select request_reward(%s)", r1)[0]
err(lambda: cur.execute("select request_reward(%s)", (r1,)), "chờ duyệt", "không xin trùng")
as_user(X); err(lambda: cur.execute("select decide_reward(%s, true)", (req,)), "Không tìm thấy", "người lạ không duyệt được")
as_user(T); cur.execute("select decide_reward(%s, true)", (req,)); ok(bal(S) == 2, "duyệt → trừ 5 sao")
as_user(X); ok(len(rows("select * from rewards")) == 0, "người lạ không thấy phần thưởng của anh")

print("\n5. Thử thách nhỏ")
as_user(T); t1 = one("select assign_task(%s, 'Đọc sách 15 phút', '', 1)", S)[0]
as_user(S); ok(len(rows("select * from tasks")) == 1, "em thấy thử thách")
cur.execute("select mark_task_done(%s)", (t1,))
as_user(T); cur.execute("select confirm_task(%s, true)", (t1,)); ok(bal(S) == 3, "hoàn thành → +1 sao")
err(lambda: cur.execute("select confirm_task(%s, true)", (t1,)), "Không tìm thấy", "không xác nhận 2 lần")
as_user(T); t2 = one("select assign_task(%s, 'Làm lại 3 câu sai', '', 1)", S)[0]
as_user(S); cur.execute("select mark_task_done(%s)", (t2,))
as_user(T); cur.execute("select confirm_task(%s, false)", (t2,)); admin()
ok(one("select status from tasks where id=%s", t2)[0] == "todo", "anh nhờ làm lại → về trạng thái cần làm")

print("\n6. Gợi ý cách làm")
a5 = make("Có gợi ý")
as_user(S); s5 = one("select start_submission(%s)", a5)[0]; q5 = one("select id from questions where assignment_id=%s", a5)[0]
levels = [one("select save_hint(%s,%s,%s)", s5, q5, f"gợi ý {i}")[0] for i in range(3)]
ok(levels == [1, 2, 3], "3 mức gợi ý 1→2→3")
err(lambda: cur.execute("select save_hint(%s,%s,'x')", (s5, q5)), "hết 3 gợi ý", "tối đa 3 gợi ý mỗi câu")
as_user(T); ok(len(rows("select * from hint_log where submission_id=%s", s5)) == 3, "anh xem được em đã dùng gợi ý nào")
as_user(X); ok(len(rows("select * from hint_log")) == 0, "người lạ không xem được")
as_user(S); cur.execute("select submit_submission(%s)", (s5,))
a6 = make("x"); as_user(S); s6 = one("select start_submission(%s)", a6)[0]; cur.execute("select submit_submission(%s)", (s6,))
q6 = one("select id from questions where assignment_id=%s", a6)[0]
err(lambda: cur.execute("select save_hint(%s,%s,'x')", (s6, q6)), "đang làm bài", "nộp rồi thì không xin gợi ý")
print(f"\nTẤT CẢ {passed} KIỂM TRA ĐỀU ĐẠT")
