"""Kiểm thử schema.sql trên Postgres thật (pgserver) với stub tối thiểu của Supabase."""
import json, sys, tempfile, unicodedata, uuid
import pgserver, psycopg

SCHEMA = sys.argv[1]
tmp = tempfile.mkdtemp()
srv = pgserver.get_server(tmp, cleanup_mode="stop")
conn = psycopg.connect(srv.get_uri(), autocommit=True)
cur = conn.cursor()

STUB = """
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
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
"""
cur.execute(STUB)
sql = open(SCHEMA, encoding="utf-8").read()
cur.execute(sql)
cur.execute(sql)  # chạy lại lần 2 phải vẫn OK
print("schema loaded twice OK")

passed = 0
def ok(cond, label):
    global passed
    if not cond:
        raise AssertionError("FAIL: " + label)
    passed += 1
    print("  ✔", label)

def admin():
    cur.execute("reset role; select set_config('request.jwt.claim.sub', '', false)")

def as_user(uid):
    admin()
    cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (str(uid),))
    cur.execute("set role authenticated")

def expect_error(fn, contains, label):
    try:
        fn()
    except psycopg.Error as e:
        ok(contains.lower() in str(e).lower(), f"{label} → lỗi '{contains}'")
        return
    raise AssertionError("FAIL (không có lỗi): " + label)

def signup(meta, email=None):
    admin()
    uid = uuid.uuid4()
    cur.execute("insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, %s)",
                (uid, email or f"{uid}@x.test", json.dumps(meta)))
    return uid

def one(query, *args):
    cur.execute(query, args)
    return cur.fetchone()

def rows(query, *args):
    cur.execute(query, args)
    return cur.fetchall()

print("\n1. Đăng ký")
t1 = signup({"role": "teacher", "full_name": "Anh Hai"})
admin(); code = one("select invite_code from profiles where id=%s", t1)[0]
ok(len(code) == 6, f"giáo viên có mã mời {code}")
expect_error(lambda: signup({"role": "student", "full_name": "X", "invite_code": "ZZZZZZ"}), "Mã mời không đúng", "sai mã mời")
s1 = signup({"role": "student", "full_name": "Bé Na", "invite_code": code.lower()})
admin(); ok(one("select teacher_id from profiles where id=%s", s1)[0] == t1, "học sinh gắn đúng người giao bài (mã chữ thường vẫn nhận)")
t2 = signup({"role": "teacher", "full_name": "Người lạ"})
admin(); code2 = one("select invite_code from profiles where id=%s", t2)[0]
s2 = signup({"role": "student", "full_name": "Học sinh khác", "invite_code": code2})
as_user(None) if False else admin()
cur.execute("set role anon")
ok(one("select public.check_invite_code(%s)", code)[0] == "Anh Hai", "anon kiểm tra mã mời được")

print("\n2. Phân quyền hồ sơ")
as_user(t1); ok({r[0] for r in rows("select full_name from profiles")} == {"Anh Hai", "Bé Na"}, "giáo viên chỉ thấy mình + học sinh của mình")
as_user(s1); ok({r[0] for r in rows("select full_name from profiles")} == {"Anh Hai", "Bé Na"}, "học sinh thấy mình + người giao bài")

print("\n3. Tạo bài")
payload = {
    "title": "Bài 1", "subject": "Toán", "student_id": str(s1), "published": True, "due_at": "2030-01-01T10:00:00Z",
    "questions": [
        {"type": "mcq", "prompt": "2+2?", "options": ["3", "4", "5"], "accepted": ["1"], "points": 1, "explanation": "2+2=4"},
        {"type": "short", "prompt": "5:2=?", "accepted": ["2,5"], "points": 2},
        {"type": "short", "prompt": "Thủ đô?", "accepted": ["Hà Nội", "Ha Noi"], "points": 1},
        {"type": "essay", "prompt": "Tả con mèo", "points": 3, "explanation": "Mẫu"},
        {"type": "photo", "prompt": "Đặt tính", "points": 3},
    ],
}
as_user(s1); expect_error(lambda: cur.execute("select save_assignment(%s)", (json.dumps(payload),)), "Chỉ người giao bài", "học sinh không tạo được bài")
as_user(t2); expect_error(lambda: cur.execute("select save_assignment(%s)", (json.dumps(payload),)), "chọn học sinh", "giáo viên khác không giao cho em được")
as_user(t1)
bad = dict(payload, questions=[{"type": "mcq", "prompt": "x", "options": ["a", "b"], "accepted": ["5"]}])
expect_error(lambda: cur.execute("select save_assignment(%s)", (json.dumps(bad),)), "Câu 1: hãy chọn phương án đúng", "kiểm tra đáp án trắc nghiệm")
bad = dict(payload, questions=[{"type": "short", "prompt": "x", "accepted": ["  "]}])
expect_error(lambda: cur.execute("select save_assignment(%s)", (json.dumps(bad),)), "ít nhất 1 đáp án", "kiểm tra đáp án điền")
a1 = one("select save_assignment(%s)", json.dumps(payload))[0]
ok(one("select count(*) from questions where assignment_id=%s", a1)[0] == 5, "lưu đủ 5 câu")
# sửa lại khi chưa có bài làm
payload["id"] = str(a1); payload["title"] = "Bài 1 (sửa)"
ok(one("select save_assignment(%s)", json.dumps(payload))[0] == a1, "sửa bài khi em chưa làm")
draft = dict(payload, id=None, title="Nháp", published=False)
a_draft = one("select save_assignment(%s)", json.dumps(draft))[0]

print("\n4. Học sinh làm bài")
as_user(s1)
ok({r[0] for r in rows("select title from assignments")} == {"Bài 1 (sửa)"}, "em thấy bài đã giao, không thấy bài nháp")
ok(one("select count(*) from questions where assignment_id=%s", a1)[0] == 5, "em đọc được câu hỏi")
ok(one("select count(*) from question_keys")[0] == 0, "em KHÔNG đọc được đáp án")
expect_error(lambda: cur.execute("select start_submission(%s)", (a_draft,)), "Không tìm thấy", "không mở được bài nháp")
sub = one("select start_submission(%s)", a1)[0]
ok(one("select start_submission(%s)", a1)[0] == sub, "mở lại vẫn cùng bài làm")
qs = rows("select id, type, prompt from questions where assignment_id=%s order by position", a1)
qid = {p: i for i, t, p in qs}
nfd_hanoi = unicodedata.normalize("NFD", "  hà   nội ")
cur.execute("select save_answer(%s,%s,%s,%s)", (sub, qid["2+2?"], "1", []))
cur.execute("select save_answer(%s,%s,%s,%s)", (sub, qid["5:2=?"], "2.50", []))
cur.execute("select save_answer(%s,%s,%s,%s)", (sub, qid["Thủ đô?"], nfd_hanoi, []))
cur.execute("select save_answer(%s,%s,%s,%s)", (sub, qid["Tả con mèo"], "Con mèo nhà em...", []))
img = f"{s1}/{sub}/a.jpg"
cur.execute("select save_answer(%s,%s,%s,%s)", (sub, qid["Đặt tính"], "", [img]))
expect_error(lambda: cur.execute("select save_answer(%s,%s,%s,%s)", (sub, qid["Đặt tính"], "", [f"{s2}/x/a.jpg"])), "Ảnh không hợp lệ", "chặn ảnh của người khác")
expect_error(lambda: cur.execute("insert into answers (submission_id, question_id, points_awarded) values (%s,%s,100)", (sub, qid["Tả con mèo"])), "permission denied", "em không tự ghi điểm được")
expect_error(lambda: cur.execute("update submissions set score=100 where id=%s", (sub,)), "permission denied", "em không sửa điểm được")

print("\n5. Kho ảnh")
cur.execute("insert into storage.objects (bucket_id, name) values ('bai-lam', %s)", (img,))
ok(True, "em tải ảnh vào thư mục của mình")
expect_error(lambda: cur.execute("insert into storage.objects (bucket_id, name) values ('bai-lam', %s)", (f"{s2}/x/b.jpg",)), "row-level security", "em không tải vào thư mục người khác")
as_user(t1); ok(one("select count(*) from storage.objects where name=%s", img)[0] == 1, "giáo viên xem được ảnh của em")
as_user(t2); ok(one("select count(*) from storage.objects")[0] == 0, "người lạ không xem được ảnh")

print("\n6. Nộp bài")
as_user(t2); ok(one("select count(*) from submissions")[0] == 0 and one("select count(*) from answers")[0] == 0, "người lạ không thấy bài làm")
as_user(t1); expect_error(lambda: cur.execute("select return_submission(%s,'[]','')", (sub,)), "chưa nộp", "chưa nộp thì chưa trả bài được")
as_user(s1)
ok(one("select submit_submission(%s)", sub)[0] == "submitted", "có tự luận/ảnh → chờ chấm")
st = one("select status, score, max_score from submissions where id=%s", sub)
ok(float(st[1]) == 4 and float(st[2]) == 10, f"máy chấm 4/10 điểm (trắc nghiệm + 2,5=2.50 + Hà Nội NFD) → {st[1]}/{st[2]}")
ok(one("select count(*) from question_keys")[0] == 0, "chưa trả bài → em vẫn chưa thấy đáp án")
expect_error(lambda: cur.execute("select save_answer(%s,%s,%s,%s)", (sub, qid["2+2?"], "0", [])), "đã nộp", "nộp rồi không sửa được")
ok(one("select submit_submission(%s)", sub)[0] == "submitted", "nộp lại lần 2 không lỗi")

print("\n7. Chấm & trả bài")
as_user(t1)
payload2 = dict(payload); payload2["title"] = "sửa nữa"
expect_error(lambda: cur.execute("select save_assignment(%s)", (json.dumps(payload2),)), "không sửa được", "khoá sửa khi em đã làm")
expect_error(lambda: cur.execute("select return_submission(%s,%s,%s)", (sub, json.dumps([{"question_id": str(qid["Tả con mèo"]), "points": "2"}]), "")), "chưa cho điểm", "phải chấm đủ câu")
grades = [{"question_id": str(qid["Tả con mèo"]), "points": "2.5", "feedback": "Hay"},
          {"question_id": str(qid["Đặt tính"]), "points": "99", "feedback": "Đúng hết"},
          {"question_id": str(qid["5:2=?"]), "points": "", "feedback": ""}]
cur.execute("select return_submission(%s,%s,%s)", (sub, json.dumps(grades), "Giỏi lắm"))
st = one("select status, score, teacher_comment from submissions where id=%s", sub)
ok(st[0] == "returned" and float(st[1]) == 9.5, f"trả bài, điểm 9.5 (điểm 99 bị giới hạn còn 3) → {st[1]}")
ok(one("select is_correct from answers where submission_id=%s and question_id=%s", sub, qid["Tả con mèo"])[0] is False, "câu được 2.5/3 tính là chưa đúng")
as_user(s2); expect_error(lambda: cur.execute("select return_submission(%s,'[]','')", (sub,)), "Không tìm thấy", "người khác không chấm được")

print("\n8. Em xem kết quả")
as_user(s1)
ok(one("select count(*) from question_keys")[0] == 5, "đã trả bài → em xem được đáp án")
ok(one("select count(*) from answers where submission_id=%s", sub)[0] == 5, "em xem được bài làm của mình")

print("\n9. Bài chỉ có trắc nghiệm → trả bài ngay")
as_user(t1)
quick = {"title": "Nhanh", "student_id": str(s1), "published": True,
         "questions": [{"type": "short", "prompt": "1+1", "accepted": ["2"], "points": 1},
                       {"type": "short", "prompt": "2+2", "accepted": ["4"], "points": 1}]}
a2 = one("select save_assignment(%s)", json.dumps(quick))[0]
as_user(s1)
sub2 = one("select start_submission(%s)", a2)[0]
q1 = one("select id from questions where assignment_id=%s and prompt='1+1'", a2)[0]
cur.execute("select save_answer(%s,%s,%s,%s)", (sub2, q1, "02", []))
ok(one("select submit_submission(%s)", sub2)[0] == "returned", "tự trả bài")
st = one("select score, max_score from submissions where id=%s", sub2)
ok(float(st[0]) == 1 and float(st[1]) == 2, "'02' = 2 đúng, câu bỏ trống = 0 điểm")

print("\n10. Hàm chấm")
admin()
for args, want in [(("short", "-3", ["-3.0"]), True), (("short", "", ["0"]), False), (("short", "A", ["a"]), True),
                   (("mcq", "1", ["1"]), True), (("mcq", "2", ["1"]), False), (("short", "12a", ["12"]), False)]:
    ok(one("select check_answer(%s,%s,%s)", *args)[0] is want, f"check_answer{args} = {want}")

print("\n11. Xoá bài")
as_user(t2); cur.execute("delete from assignments where id=%s", (a1,)); admin()
ok(one("select count(*) from assignments where id=%s", a1)[0] == 1, "người lạ không xoá được")
as_user(t1); cur.execute("delete from assignments where id=%s", (a_draft,)); admin()
ok(one("select count(*) from assignments where id=%s", a_draft)[0] == 0, "giáo viên xoá được bài của mình")

print(f"\nTẤT CẢ {passed} KIỂM TRA ĐỀU ĐẠT")
