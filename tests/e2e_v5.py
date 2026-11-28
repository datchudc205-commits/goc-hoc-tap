"""Thử nâng cấp 5 trên Supabase THẬT: ảnh đề bài (AI đọc đề → chấm theo đề), câu hỏi trò chơi AI, sao trò chơi, khoá trò chơi.
Dùng: py tests/e2e_v5.py de_bai.jpg bai_lam.jpg
  - ảnh đề: Bài 1 (25 × 4; 144 : 12), Bài 2 (x + 37 = 95), Bài 3 (7·7·7·7 dạng lũy thừa)
  - ảnh vở: Bài 1 đúng, Bài 2 sai (x = 95 + 37 = 132), Bài 3 bỏ trống"""
import json, pathlib, sys, time, urllib.request, uuid

ns = {"__file__": str(pathlib.Path(__file__).resolve().parent / "e2e_supabase.py")}
exec(open(ns["__file__"], encoding="utf-8").read().split("n = 0")[0], ns)
call, los, URL, KEY = ns["call"], ns["login_or_signup"], ns["URL"], ns["KEY"]
de_img, bl_img = sys.argv[1], sys.argv[2]
n = 0
def ok(c, label, extra=""):
    global n
    if not c: sys.exit(f"✘ FAIL: {label} {extra}")
    n += 1; print("  ✔", label)
def ai(body, token, tries=5):
    for i in range(tries):
        t0 = time.time()
        st, r = call("POST", "/functions/v1/ai", body, token=token)
        print(f"     ({body['action']}: HTTP {st}, {time.time() - t0:.0f}s)")
        if st == 200 or st not in (429, 502, 503): return st, r
        print("     ", r.get("error")); time.sleep(20)
    return st, r
def upload(token, path, f):
    req = urllib.request.Request(f"{URL}/storage/v1/object/bai-lam/{path}", data=open(f, "rb").read(), method="POST")
    req.add_header("apikey", KEY); req.add_header("Authorization", "Bearer " + token); req.add_header("Content-Type", "image/jpeg")
    with urllib.request.urlopen(req) as r: return r.status

tt, tid = los("gvthu@hocsinh.example", {"role": "teacher", "full_name": "Giáo viên thử"})
code = call("GET", f"/rest/v1/profiles?id=eq.{tid}&select=invite_code", token=tt)[1][0]["invite_code"]
ts, sid = los("hsthu@hocsinh.example", {"role": "student", "full_name": "Học sinh thử", "grade": "6", "invite_code": code})

print("\n1. Ảnh đề bài → AI đọc đề → chấm theo đề")
folder = f"{sid}/lop-{uuid.uuid4()}"
ok(upload(ts, f"{folder}/de-1.jpg", de_img) == 200 and upload(ts, f"{folder}/1.jpg", bl_img) == 200, "em tải ảnh đề + ảnh vở lên")
st, cw = call("POST", "/rest/v1/rpc/create_classwork", {"p_student": sid, "p_subject": "Toán", "p_lesson": "Luyện tập trang 24",
    "p_note": "", "p_images": [f"{folder}/1.jpg"], "p_problem_images": [f"{folder}/de-1.jpg"]}, token=ts)
ok(st == 200, "gửi bài kèm ảnh đề", (st, cw))
st, r = ai({"action": "scan_problem", "classwork_id": cw}, ts)
ok(st == 200 and len(r["problems"]) == 3, "AI đọc đề: 3 bài", r)
for p in r["problems"]: print(f"     {p['label']}: {p['text'].replace(chr(10), ' / ')}")
alltext = " ".join(p["text"] for p in r["problems"]).replace(" ", "")
ok("x+37=95" in alltext and "144:12" in alltext and "25×4" in alltext, "chép đúng số liệu trong đề")
st, r = ai({"action": "check_classwork", "classwork_id": cw}, ts)
ok(st == 200 and r.get("with_problems"), "AI chấm bài theo đề đã đọc", r)
for it in r["items"]: print(f"     {it['label']}: {it['verdict']} – em viết: {it['student_answer'][:60]!r} | {it['explanation'][:90]}")
v = {it["label"].replace(" ", "").rstrip(".").lower(): it["verdict"] for it in r["items"]}
ok(v.get("bài1") == "dung", "Bài 1 → đúng", v)
ok(v.get("bài2") == "sai", "Bài 2 → sai (em cộng thay vì trừ)", v)
ok(v.get("bài3") == "chua_lam", "Bài 3 → chưa làm (em bỏ trống)", v)
print(f"     điểm AI ước lượng: {r['score']}")
st, row = call("GET", f"/rest/v1/classwork?id=eq.{cw}&select=status,problems,ai_result", token=tt)
ok(row[0]["status"] == "checked" and len(row[0]["problems"]) == 3, "anh xem được đề + kết quả")

print("\n2. AI soạn câu hỏi trò chơi")
st, r = ai({"action": "game_quiz", "subject": "Khoa học tự nhiên", "lesson": "Bài 10. Các thể của chất và sự chuyển thể"}, ts)
ok(st == 200 and len(r["items"]) >= 8, f"{len(r.get('items', []))} câu hỏi", r)
ok(all(len(i["wrong"]) == 3 and i["a"] not in i["wrong"] and "$" not in i["q"] for i in r["items"]), "mỗi câu 1 đúng + 3 sai, không có ký hiệu LaTeX")
for i in r["items"][:4]: print(f"     {i['q']} → {i['a']}  (sai: {', '.join(i['wrong'])})")

print("\n3. Sao từ trò chơi + khoá trò chơi")
st, s0 = call("POST", "/rest/v1/rpc/game_status", {}, token=ts)
ok(st == 200 and s0["locked"] is False, "mặc định không khoá", s0)
st, star = call("POST", "/rest/v1/rpc/finish_game", {"p_game": "Bắn bóng bay", "p_pack": "Toán · thử", "p_score": 150, "p_correct": 9, "p_total": 10, "p_seconds": 60}, token=ts)
ok(st == 200 and star == 1, "đúng 9/10 → +1 ⭐", (st, star))
st, ses = call("GET", f"/rest/v1/game_sessions?student_id=eq.{sid}&select=game,correct,total,stars", token=tt)
ok(len(ses) == 1 and ses[0]["stars"] == 1, "anh thấy em vừa chơi gì")
call("POST", "/rest/v1/rpc/save_game_settings", {"p_lock": True, "p_cap": 2}, token=tt)
st, aid = call("POST", "/rest/v1/rpc/save_assignment", {"p": {"title": "Thử khoá trò chơi", "subject": "Toán", "student_id": sid, "published": True,
    "questions": [{"type": "short", "prompt": "1+1", "accepted": ["2"], "points": 1}]}}, token=tt)
st, s1 = call("POST", "/rest/v1/rpc/game_status", {}, token=ts)
ok(s1["locked"] and s1["pending"] >= 1, "bật khoá + còn bài → khoá", s1)
st, e = call("POST", "/rest/v1/rpc/finish_game", {"p_game": "x", "p_pack": "", "p_score": 1, "p_correct": 1, "p_total": 1, "p_seconds": 30}, token=ts)
ok(st >= 400, "đang khoá thì không lưu lượt chơi")

print("\n(dọn dữ liệu thử)")
call("DELETE", f"/rest/v1/assignments?id=eq.{aid}", token=tt)
call("POST", "/rest/v1/rpc/delete_classwork", {"p_id": cw}, token=ts)
req = urllib.request.Request(f"{URL}/storage/v1/object/bai-lam", data=json.dumps({"prefixes": [f"{folder}/de-1.jpg", f"{folder}/1.jpg"]}).encode(), method="DELETE")
req.add_header("apikey", KEY); req.add_header("Authorization", "Bearer " + ts); req.add_header("Content-Type", "application/json")
with urllib.request.urlopen(req) as r2: print("   xoá ảnh thử → HTTP", r2.status)
print(f"\nTẤT CẢ {n} KIỂM TRA ĐỀU ĐẠT")
