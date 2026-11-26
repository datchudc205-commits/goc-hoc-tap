"""Thử bản nâng cấp 2 trên Supabase THẬT: danh sách học sinh, đặt lại mật khẩu, kiểm tra bài trên lớp bằng AI.
Dùng: py tests/e2e_v2.py anh1.jpg [anh2.jpg]"""
import pathlib, sys, time, urllib.request, uuid

ns = {"__file__": str(pathlib.Path(__file__).resolve().parent / "e2e_supabase.py")}
exec(open(ns["__file__"], encoding="utf-8").read().split("n = 0")[0], ns)
call, URL, KEY, PW = ns["call"], ns["URL"], ns["KEY"], ns["PW"]

n = 0
def ok(c, label, extra=""):
    global n
    if not c: sys.exit(f"✘ FAIL: {label} {extra}")
    n += 1; print("  ✔", label)
def login(email, pw):
    st, d = call("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": pw})
    return (d["access_token"], d["user"]["id"]) if st == 200 else (None, d)

tt, tid = login("gvthu@hocsinh.example", PW)
ts, sid = login("hsthu@hocsinh.example", PW)
ok(tt and ts, "đăng nhập 2 tài khoản thử")

print("\n1. Học sinh & mật khẩu")
st, lst = call("POST", "/rest/v1/rpc/my_students", {}, token=tt)
ok(st == 200 and any(s["login"] == "hsthu" for s in lst), "người giao bài thấy tên đăng nhập 'hsthu'", lst)
st, _ = call("POST", "/rest/v1/rpc/set_student_grade", {"p_student": sid, "p_grade": 6}, token=tt)
ok(st in (200, 204), "đặt lớp 6 cho học sinh")
tmp = "tam" + uuid.uuid4().hex[:6]
st, _ = call("POST", "/rest/v1/rpc/reset_password", {"p_user": sid, "p_password": tmp}, token=tt)
ok(st in (200, 204), "đặt lại mật khẩu cho học sinh", st)
ok(login("hsthu@hocsinh.example", PW)[0] is None, "mật khẩu cũ không còn dùng được")
ok(login("hsthu@hocsinh.example", tmp)[0] is not None, "đăng nhập được bằng mật khẩu mới (bcrypt thật trên Supabase)")
call("POST", "/rest/v1/rpc/reset_password", {"p_user": sid, "p_password": PW}, token=tt)
ts, _ = login("hsthu@hocsinh.example", PW)
ok(ts is not None, "đổi lại mật khẩu cũ cho tài khoản thử")
st, d = call("POST", "/rest/v1/rpc/reset_password", {"p_user": tid, "p_password": "x123456"}, token=ts)
ok(st >= 400, "học sinh không đổi được mật khẩu người khác")
st, d = call("POST", "/rest/v1/rpc/admin_list_users", {}, token=tt)
ok(st >= 400, "người giao bài thường (không phải admin) không vào được trang quản trị")

print("\n2. Kiểm tra bài trên lớp")
folder = f"{sid}/lop-{uuid.uuid4().hex}"
paths = []
for i, f in enumerate(sys.argv[1:3], 1):
    path = f"{folder}/{i}.jpg"
    req = urllib.request.Request(f"{URL}/storage/v1/object/bai-lam/{path}", data=open(f, "rb").read(), method="POST")
    req.add_header("apikey", KEY); req.add_header("Authorization", "Bearer " + ts); req.add_header("Content-Type", "image/jpeg")
    urllib.request.urlopen(req); paths.append(path)
ok(len(paths) >= 1, f"học sinh tải {len(paths)} ảnh lên")
st, cw = call("POST", "/rest/v1/rpc/create_classwork", {"p_student": None, "p_subject": "Toán", "p_lesson": "Bài 5. Phép nhân và phép chia số tự nhiên", "p_note": "bài làm trên lớp", "p_images": paths}, token=ts)
ok(st == 200 and cw, "tạo bài kiểm tra trên lớp", (st, cw))
for attempt in range(1, 5):
    t0 = time.time()
    st, r = call("POST", "/functions/v1/ai", {"action": "check_classwork", "classwork_id": cw}, token=ts)
    print(f"   AI lần {attempt}: HTTP {st} sau {time.time() - t0:.1f}s")
    if st == 200 or st not in (429, 502, 503): break
    print("    ", r.get("error")); time.sleep(20)
ok(st == 200, "học sinh tự gọi AI kiểm tra bài trên lớp", r)
for it in r["items"]:
    print(f"   - {it['label']}: {it['verdict']} | em làm: {it['student_answer'][:60]} | đúng: {it['correct_answer'][:40]}")
print(f"   Điểm AI: {r['score']} · Mạnh: {r['strengths'][:80]} · Cần cải thiện: {r['improve'][:80]}")
st, row = call("GET", f"/rest/v1/classwork?id=eq.{cw}&select=status,score", token=tt)
ok(row and row[0]["status"] == "checked", "kết quả AI đã lưu, người giao bài xem được", row)
st, _ = call("POST", "/rest/v1/rpc/review_classwork", {"p_id": cw, "p_comment": "Giỏi lắm!"}, token=tt)
ok(st in (200, 204), "người giao bài nhận xét")
st, row = call("GET", f"/rest/v1/classwork?id=eq.{cw}&select=teacher_comment", token=ts)
ok(row[0]["teacher_comment"] == "Giỏi lắm!", "học sinh thấy nhận xét")
st, _ = call("POST", "/rest/v1/rpc/delete_classwork", {"p_id": cw}, token=ts)
ok(st in (200, 204), "xoá bài thử")
print(f"\nTẤT CẢ {n} KIỂM TRA ĐỀU ĐẠT")
