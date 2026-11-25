"""Chạy thử toàn bộ luồng trên Supabase THẬT qua API (như app làm).
Dùng: py tests/e2e_supabase.py   (đọc URL/khóa từ js/config.js, mật khẩu từ tests/tai-khoan-thu.txt)"""
import json, pathlib, re, sys, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parent.parent
cfg = (ROOT / "js/config.js").read_text(encoding="utf-8")
URL = re.search(r"SUPABASE_URL = '([^']+)'", cfg).group(1)
KEY = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", cfg).group(1)
PW = re.search(r"Mật khẩu chung:\s+(\S+)", (ROOT / "tests/tai-khoan-thu.txt").read_text(encoding="utf-8")).group(1)

def call(method, path, body=None, token=None, accept=None):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("apikey", KEY)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    if accept: req.add_header("Accept", accept)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "null")

def login_or_signup(email, meta):
    st, d = call("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": PW})
    if st == 200: return d["access_token"], d["user"]["id"]
    st, d = call("POST", "/auth/v1/signup", {"email": email, "password": PW, "data": meta})
    assert st == 200 and d.get("access_token"), f"signup {email} lỗi: {st} {d}"
    return d["access_token"], d["user"]["id"]

n = 0
def ok(cond, label, extra=""):
    global n
    if not cond: sys.exit(f"✘ FAIL: {label} {extra}")
    n += 1; print("  ✔", label)

print("Supabase:", URL)
tt, tid = login_or_signup("gvthu@hocsinh.example", {"role": "teacher", "full_name": "Giáo viên thử"})
st, me = call("GET", f"/rest/v1/profiles?id=eq.{tid}&select=*", token=tt)
ok(st == 200 and me and me[0]["role"] == "teacher", "đăng ký người giao bài + có mã mời", me)
code = me[0]["invite_code"]

st, name = call("POST", "/rest/v1/rpc/check_invite_code", {"p_code": code})
ok(st == 200 and name == "Giáo viên thử", "kiểm tra mã mời khi chưa đăng nhập")
st, d = call("POST", "/auth/v1/signup", {"email": "hssai@hocsinh.example", "password": PW, "data": {"role": "student", "invite_code": "ZZZZZZ"}})
ok(st >= 400, "mã mời sai → không tạo được tài khoản", st)

ts, sid = login_or_signup("hsthu@hocsinh.example", {"role": "student", "full_name": "Học sinh thử", "invite_code": code})
st, d = call("GET", "/rest/v1/profiles?select=full_name,role&order=role", token=tt)
ok(st == 200 and len(d) == 2, "người giao bài thấy học sinh của mình", d)

payload = {"title": "Bài thử tự động", "subject": "Toán", "student_id": sid, "published": True, "questions": [
    {"type": "mcq", "prompt": "7 × 8 = ?", "options": ["54", "56", "63"], "accepted": ["1"], "points": 2},
    {"type": "short", "prompt": "10 : 4 = ?", "accepted": ["2,5"], "points": 1},
    {"type": "essay", "prompt": "Vì sao 7 × 0 = 0?", "points": 2}]}
st, aid = call("POST", "/rest/v1/rpc/save_assignment", {"p": payload}, token=tt)
ok(st == 200 and aid, "giao bài", (st, aid))
st, d = call("POST", "/rest/v1/rpc/save_assignment", {"p": payload}, token=ts)
ok(st >= 400, "học sinh không tạo được bài")

st, d = call("GET", "/rest/v1/question_keys?select=*", token=ts)
ok(st == 200 and d == [], "học sinh chưa xem được đáp án")
st, sub = call("POST", "/rest/v1/rpc/start_submission", {"p_assignment": aid}, token=ts)
ok(st == 200 and sub, "học sinh mở bài")
st, qs = call("GET", f"/rest/v1/questions?assignment_id=eq.{aid}&select=id,type&order=position", token=ts)
ans = {"mcq": "1", "short": "2.50", "essay": "Vì lấy 7 lần số 0"}
for q in qs:
    st, _ = call("POST", "/rest/v1/rpc/save_answer", {"p_submission": sub, "p_question": q["id"], "p_text": ans[q["type"]], "p_images": []}, token=ts)
    ok(st in (200, 204), f"lưu câu trả lời ({q['type']})", st)
st, d = call("POST", "/rest/v1/rpc/submit_submission", {"p_submission": sub}, token=ts)
ok(st == 200 and d == "submitted", "nộp bài → chờ chấm (có câu tự luận)", d)
st, s = call("GET", f"/rest/v1/submissions?id=eq.{sub}&select=status,score,max_score", token=ts)
ok(float(s[0]["score"]) == 3 and float(s[0]["max_score"]) == 5, "máy tự chấm 3/5 (trắc nghiệm + 2,5 = 2.50)", s)

essay = next(q["id"] for q in qs if q["type"] == "essay")
st, _ = call("POST", "/rest/v1/rpc/return_submission", {"p_submission": sub, "p_grades": [{"question_id": essay, "points": "2", "feedback": "Đúng"}], "p_comment": "Giỏi"}, token=tt)
ok(st in (200, 204), "người giao bài chấm & trả bài", st)
st, s = call("GET", f"/rest/v1/submissions?id=eq.{sub}&select=status,score", token=ts)
ok(s[0]["status"] == "returned" and float(s[0]["score"]) == 5, "học sinh thấy điểm 5/5", s)
st, d = call("GET", "/rest/v1/question_keys?select=question_id", token=ts)
ok(len(d) == 3, "sau khi trả bài học sinh xem được đáp án")

st, d = call("GET", "/rest/v1/assignments?select=id")  # không đăng nhập
ok(st == 200 and d == [] or st >= 400, "người lạ (chưa đăng nhập) không đọc được bài tập", (st, d))

# dọn bài thử (ảnh không có)
st, _ = call("DELETE", f"/rest/v1/assignments?id=eq.{aid}", token=tt)
ok(st in (200, 204), "xoá bài thử")
print(f"\nTẤT CẢ {n} KIỂM TRA TRÊN SUPABASE THẬT ĐỀU ĐẠT")
