"""Thử AI chấm ẢNH bài làm viết tay trên Supabase THẬT.
Dùng: py tests/e2e_ai_photo.py anh_dung.jpg anh_sai.jpg
  - ảnh 1: bài đặt tính 27 × 7 (đáp án đúng 189)
  - ảnh 2: bài đặt tính 34 × 6 (đáp án đúng 204)"""
import pathlib, sys, time, urllib.request, uuid

ns = {"__file__": str(pathlib.Path(__file__).resolve().parent / "e2e_supabase.py")}
exec(open(ns["__file__"], encoding="utf-8").read().split("n = 0")[0], ns)
call, login, URL, KEY = ns["call"], ns["login_or_signup"], ns["URL"], ns["KEY"]
img1, img2 = sys.argv[1], sys.argv[2]

tt, tid = login("gvthu@hocsinh.example", {})
ts, sid = login("hsthu@hocsinh.example", {})

payload = {"title": "Bài thử AI chấm ảnh", "subject": "Toán", "student_id": sid, "published": True, "questions": [
    {"type": "photo", "prompt": "Đặt tính rồi tính: 27 × 7", "points": 2, "explanation": "27 × 7 = 189"},
    {"type": "photo", "prompt": "Đặt tính rồi tính: 34 × 6", "points": 2, "explanation": "34 × 6 = 204"}]}
st, aid = call("POST", "/rest/v1/rpc/save_assignment", {"p": payload}, token=tt)
st, sub = call("POST", "/rest/v1/rpc/start_submission", {"p_assignment": aid}, token=ts)
st, qs = call("GET", f"/rest/v1/questions?assignment_id=eq.{aid}&select=id,prompt&order=position", token=ts)

for q, f in zip(qs, [img1, img2]):
    path = f"{sid}/{sub}/{q['id']}-{uuid.uuid4().hex[:6]}.jpg"
    req = urllib.request.Request(f"{URL}/storage/v1/object/bai-lam/{path}", data=open(f, "rb").read(), method="POST")
    req.add_header("apikey", KEY); req.add_header("Authorization", "Bearer " + ts); req.add_header("Content-Type", "image/jpeg")
    with urllib.request.urlopen(req) as r:
        print(f"   tải ảnh lên ({pathlib.Path(f).name}) → HTTP {r.status}")
    st, _ = call("POST", "/rest/v1/rpc/save_answer", {"p_submission": sub, "p_question": q["id"], "p_text": "", "p_images": [path]}, token=ts)
st, status = call("POST", "/rest/v1/rpc/submit_submission", {"p_submission": sub}, token=ts)
print(f"   nộp bài → {status}")

prompts = {q["id"]: q["prompt"] for q in qs}
for attempt in range(1, 6):
    t0 = time.time()
    st, g = call("POST", "/functions/v1/ai", {"action": "grade", "submission_id": sub}, token=tt)
    print(f"   lần {attempt}: HTTP {st} sau {time.time() - t0:.1f}s")
    if st == 200:
        for r in g["grades"]:
            print(f"   - {prompts[r['question_id']]} → {r['points']}/2 điểm ({r['confidence']}): {r['feedback']}")
        print(f"   Nhận xét chung: {g['overall_comment']}")
        break
    print(f"     {g.get('error')}")
    if st not in (502, 503, 429): break
    time.sleep(20)

call("DELETE", f"/rest/v1/assignments?id=eq.{aid}", token=tt)
print("(đã xoá bài thử; ảnh thử vẫn nằm trong Storage)")
