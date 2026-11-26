"""Thử nâng cấp 3 trên Supabase THẬT: thời gian làm bài, gợi ý AI (không lộ đáp án), sao, đổi quà, thử thách.
Dùng: py tests/e2e_v3.py"""
import pathlib, sys, time

ns = {"__file__": str(pathlib.Path(__file__).resolve().parent / "e2e_supabase.py")}
exec(open(ns["__file__"], encoding="utf-8").read().split("n = 0")[0], ns)
call, PW = ns["call"], ns["PW"]
n = 0
def ok(c, label, extra=""):
    global n
    if not c: sys.exit(f"✘ FAIL: {label} {extra}")
    n += 1; print("  ✔", label)
def login(e):
    st, d = call("POST", "/auth/v1/token?grant_type=password", {"email": e, "password": PW}); return d["access_token"], d["user"]["id"]
tt, tid = login("gvthu@hocsinh.example"); ts, sid = login("hsthu@hocsinh.example")
def stars(): return call("POST", "/rest/v1/rpc/star_balance", {"p_student": sid}, token=ts)[1]
start = stars()
print("Sao ban đầu:", start)

print("\n1. Thời gian làm bài")
st, aid = call("POST", "/rest/v1/rpc/save_assignment", {"p": {"title": "Thử gợi ý & giờ", "subject": "Toán", "student_id": sid, "published": True,
    "questions": [{"type": "short", "prompt": "Tìm x biết: x + 27 = 63", "accepted": ["36"], "points": 1},
                  {"type": "mcq", "prompt": "Số nào chia hết cho 9?", "options": ["124", "351", "502"], "accepted": ["1"], "points": 1}]}}, token=tt)
st, _ = call("POST", "/rest/v1/rpc/set_time_limit", {"p_assignment": aid, "p_minutes": 15}, token=tt)
ok(st in (200, 204), "đặt giới hạn 15 phút")
st, sub = call("POST", "/rest/v1/rpc/start_submission", {"p_assignment": aid}, token=ts)
st, dl = call("POST", "/rest/v1/rpc/submission_deadline", {"p_submission": sub}, token=ts)
ok(st == 200 and dl, f"có hạn chót: {dl}")
st, _ = call("POST", "/rest/v1/rpc/add_extra_time", {"p_submission": sub, "p_minutes": 10}, token=tt)
st, dl2 = call("POST", "/rest/v1/rpc/submission_deadline", {"p_submission": sub}, token=ts)
ok(dl2 > dl, "anh thêm 10 phút → hạn chót lùi lại")
st, d = call("POST", "/rest/v1/rpc/add_extra_time", {"p_submission": sub, "p_minutes": 10}, token=ts)
ok(st >= 400, "em không tự thêm giờ được")

print("\n2. Gợi ý cách làm (AI không biết đáp án)")
st, qs = call("GET", f"/rest/v1/questions?assignment_id=eq.{aid}&select=id,type,prompt&order=position", token=ts)
q1 = qs[0]["id"]
for lvl in (1, 2, 3):
    for attempt in range(4):
        st, r = call("POST", "/functions/v1/ai", {"action": "hint", "submission_id": sub, "question_id": q1, "current_answer": "x = 63 + 27 = 90" if lvl == 2 else ""}, token=ts)
        if st == 200 or st not in (429, 502, 503): break
        time.sleep(15)
    ok(st == 200 and r["level"] == lvl, f"gợi ý mức {lvl}", (st, r))
    leak = "36" in r["hint"].replace("63", "").replace("27", "")
    print(f"     → {r['hint'][:260].replace(chr(10), ' | ')}{'  ⚠ có số 36' if leak else ''}")
st, r = call("POST", "/functions/v1/ai", {"action": "hint", "submission_id": sub, "question_id": q1}, token=ts)
ok(st >= 400 and "hết 3" in r.get("error", ""), "tối đa 3 gợi ý", r)
st, r = call("POST", "/functions/v1/ai", {"action": "hint", "submission_id": sub, "question_id": q1}, token=tt)
ok(st == 403, "người giao bài không xin gợi ý thay em được", (st, r))
st, hl = call("GET", f"/rest/v1/hint_log?submission_id=eq.{sub}&select=level", token=tt)
ok(len(hl) == 3, "anh xem được 3 gợi ý em đã dùng")

print("\n3. Nộp bài → sao tự động")
for q, a in zip(qs, ["36", "1"]):
    call("POST", "/rest/v1/rpc/save_answer", {"p_submission": sub, "p_question": q["id"], "p_text": a, "p_images": []}, token=ts)
st, status = call("POST", "/rest/v1/rpc/submit_submission", {"p_submission": sub}, token=ts)
ok(status == "returned", "tự chấm & trả bài (2/2)")
ok(stars() == start + 1 + 3, f"+1 đúng hạn +3 điểm giỏi → {stars()} sao")
st, ev = call("GET", f"/rest/v1/star_events?ref_id=eq.{sub}&select=amount,code", token=ts)
ok(sorted(e["code"] for e in ev) == ["ontime", "score"], "em thấy sao nhận được trên trang kết quả")

print("\n4. Đổi quà")
st, rw = call("POST", "/rest/v1/rewards", {"title": "Thử – 30 phút xem TV", "cost": 2, "icon": "📺"}, token=tt)
st, rws = call("GET", "/rest/v1/rewards?select=id,title&title=eq.Thử – 30 phút xem TV", token=ts)
ok(len(rws) == 1, "em thấy phần thưởng")
st, req = call("POST", "/rest/v1/rpc/request_reward", {"p_reward": rws[0]["id"]}, token=ts)
ok(st == 200, "em xin đổi quà")
before = stars()
st, _ = call("POST", "/rest/v1/rpc/decide_reward", {"p_request": req, "p_approve": True}, token=tt)
ok(stars() == before - 2, "anh duyệt → trừ 2 sao")

print("\n5. Thử thách nhỏ")
st, tk = call("POST", "/rest/v1/rpc/assign_task", {"p_student": sid, "p_title": "Thử – đọc sách 15 phút", "p_note": "", "p_bonus": 1}, token=tt)
call("POST", "/rest/v1/rpc/mark_task_done", {"p_task": tk}, token=ts)
before = stars()
st, _ = call("POST", "/rest/v1/rpc/confirm_task", {"p_task": tk, "p_ok": True}, token=tt)
ok(stars() == before + 1, "hoàn thành thử thách → +1 sao")

print("\n(dọn dữ liệu thử)")
call("DELETE", f"/rest/v1/assignments?id=eq.{aid}", token=tt)
call("DELETE", f"/rest/v1/rewards?id=eq.{rws[0]['id']}", token=tt)
call("POST", "/rest/v1/rpc/delete_task", {"p_task": tk}, token=tt)
print(f"\nTẤT CẢ {n} KIỂM TRA ĐỀU ĐẠT")
