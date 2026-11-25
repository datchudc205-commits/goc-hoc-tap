"""Chạy thử AI (Gemini) trên Supabase THẬT: soạn đề + gợi ý chấm.  Dùng: py tests/e2e_ai.py"""
import json, pathlib, sys, time

ns = {"__file__": str(pathlib.Path(__file__).resolve().parent / "e2e_supabase.py")}
exec(open(ns["__file__"], encoding="utf-8").read().split("n = 0")[0], ns)
call, login = ns["call"], ns["login_or_signup"]

tt, tid = login("gvthu@hocsinh.example", {})
ts, sid = login("hsthu@hocsinh.example", {})

print("1. AI soạn đề …")
t0 = time.time()
st, d = call("POST", "/functions/v1/ai", {"action": "generate", "topic": "Bảng nhân 7 và bài toán có lời văn về phép nhân",
                                          "subject": "Toán", "grade": "3", "level": "vừa", "count": 4, "types": ["mcq", "short", "essay"]}, token=tt)
print(f"   HTTP {st} sau {time.time() - t0:.1f}s")
if st != 200:
    sys.exit(f"   LỖI: {d}")
for q in d["questions"]:
    print(f"   - [{q['type']}] {q['prompt']}  | đáp án: {q['accepted'] or q['explanation'][:60]}")
    if q["type"] == "mcq": print(f"       phương án: {q['options']}")

st, d2 = call("POST", "/functions/v1/ai", {"action": "generate", "topic": "x"}, token=ts)
print(f"   học sinh gọi AI → HTTP {st} {d2.get('error')}")
st, d3 = call("POST", "/functions/v1/ai", {"action": "generate", "topic": "x"})
print(f"   chưa đăng nhập gọi AI → HTTP {st}")

print("\n2. AI gợi ý chấm …")
payload = {"title": "Bài thử AI chấm", "subject": "Toán", "student_id": sid, "published": True, "questions": [
    {"type": "essay", "prompt": "Mẹ mua 7 hộp bánh, mỗi hộp có 6 cái. Hỏi mẹ mua tất cả bao nhiêu cái bánh? Trình bày lời giải.", "points": 2,
     "explanation": "Số bánh mẹ mua là: 7 × 6 = 42 (cái). Đáp số: 42 cái bánh."},
    {"type": "essay", "prompt": "Vì sao 7 × 0 = 0?", "points": 2, "explanation": "Số nào nhân với 0 cũng bằng 0 (lấy 7 lần số 0)."},
    {"type": "short", "prompt": "Thủ đô của Việt Nam là thành phố nào?", "accepted": ["Hà Nội"], "points": 1}]}
st, aid = call("POST", "/rest/v1/rpc/save_assignment", {"p": payload}, token=tt)
st, sub = call("POST", "/rest/v1/rpc/start_submission", {"p_assignment": aid}, token=ts)
st, qs = call("GET", f"/rest/v1/questions?assignment_id=eq.{aid}&select=id,prompt&order=position", token=ts)
answers = ["Mẹ mua tất cả số bánh là 7 x 6 = 48 cái. Đáp số 48 cái", "vì 0 nhân với số nào cũng bằng 0", "TP Hà Nội"]
for q, a in zip(qs, answers):
    call("POST", "/rest/v1/rpc/save_answer", {"p_submission": sub, "p_question": q["id"], "p_text": a, "p_images": []}, token=ts)
st, status = call("POST", "/rest/v1/rpc/submit_submission", {"p_submission": sub}, token=ts)
t0 = time.time()
st, g = call("POST", "/functions/v1/ai", {"action": "grade", "submission_id": sub}, token=tt)
print(f"   HTTP {st} sau {time.time() - t0:.1f}s")
if st != 200:
    sys.exit(f"   LỖI: {g}")
prompts = {q["id"]: q["prompt"] for q in qs}
for r in g["grades"]:
    print(f"   - {prompts[r['question_id']][:45]}… → {r['points']} điểm ({r['confidence']}): {r['feedback']}")
print(f"   Nhận xét chung: {g['overall_comment']}")

call("DELETE", f"/rest/v1/assignments?id=eq.{aid}", token=tt)
print("\n(đã xoá bài thử)")
