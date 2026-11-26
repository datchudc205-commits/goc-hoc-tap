import { html, useState, useRef, useEffect } from './lib.js';
import { sb, q, rpc, signedUrls, BUCKET } from './db.js';
import {
  useLoad, Loading, ErrorBox, Back, go, TYPE_LABEL, fmtDate, fmtNum, dueInfo, ScoreBadge, scoreOn10, nl2br, Icon,
  toast, confirmDialog, EmptyState, SubjectChip, subjectTone, ProgressRing, relTime, countdown,
} from './ui.js';
import { AnswerView, keyOf } from './teacher.js';
import { compressImage } from './image.js';

// =====================================================================
//  TRANG CHÍNH CỦA EM
// =====================================================================
export function StudentHome({ profile }) {
  const [list, err] = useLoad(() => q(sb.from('assignments')
    .select('id, title, subject, due_at, instructions, created_at, submissions(id, status, score, max_score, submitted_at, returned_at)')
    .eq('student_id', profile.id).eq('published', true)
    .order('created_at', { ascending: false })));

  if (err) return html`<${ErrorBox} msg=${err} />`;
  if (!list) return html`<${Loading} />`;

  const todo = [], waiting = [], done = [];
  for (const a of list) {
    const s = a.submissions[0];
    if (!s || s.status === 'in_progress') todo.push(a);
    else if (s.status === 'submitted') waiting.push(a);
    else done.push(a);
  }
  const t = (a) => (a.due_at ? new Date(a.due_at).getTime() : Infinity);
  todo.sort((a, b) => t(a) - t(b));

  const doneAvg = done.length ? done.reduce((t, a) => t + (scoreOn10(a.submissions[0].score, a.submissions[0].max_score) || 0), 0) / done.length : null;
  const finished = waiting.length + done.length;

  const Card = ({ a }) => {
    const s = a.submissions[0];
    const open = !s || s.status === 'in_progress';
    const href = open ? `#/lam/${a.id}` : `#/ket-qua/${s.id}`;
    const cd = open && a.due_at ? countdown(a.due_at) : null;
    return html`
      <a class=${'task-card tone-' + subjectTone(a.subject)} href=${href}>
        <div class="task-top"><${SubjectChip} subject=${a.subject} short />
          ${cd && html`<span class=${'due-pill ' + (cd.late ? 'late' : cd.soon ? 'soon' : '')}><${Icon} name="clock" size=${13} /> ${cd.text}</span>`}
          ${s && s.status === 'submitted' && html`<span class="tag orange">Chờ chấm</span>`}
          ${s && s.status === 'returned' && html`<${ScoreBadge} score=${s.score} max=${s.max_score} />`}
        </div>
        <div class="task-title">${a.title}</div>
        <div class="task-foot">
          <span class="small muted">Giao ${relTime(a.created_at)}</span>
          ${open ? html`<span class="btn sm primary">${s ? 'Làm tiếp' : 'Làm bài'} <${Icon} name="arrowRight" size=${15} /></span>`
            : html`<span class="link small">Xem kết quả <${Icon} name="chevronRight" size=${14} /></span>`}
        </div>
      </a>`;
  };

  return html`
    <section class="hero-card">
      <div class="hero-text">
        <p class="eyebrow light">${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</p>
        <h1>Chào ${profile.full_name}! 👋</h1>
        <p>${todo.length ? `Hôm nay em có ${todo.length} bài cần làm. Cố lên nhé!` : 'Em đã làm hết bài được giao – giỏi quá! 🎉'}</p>
        <div class="row wrap-row">
          ${todo[0] && html`<a class="btn white" href=${'#/lam/' + todo[0].id}><${Icon} name="arrowRight" /> Làm bài tiếp theo</a>`}
          <a class="btn glass" href="#/tren-lop/moi"><${Icon} name="camera" /> Kiểm tra bài trên lớp</a>
        </div>
      </div>
      <div class="hero-stats">
        <${ProgressRing} value=${list.length ? finished / list.length : 0} label=${`${finished}/${list.length}`} sub="đã nộp" size=${104} />
        <div class="hero-mini">
          <div><b>${done.length}</b><span>bài có điểm</span></div>
          <div><b>${doneAvg == null ? '–' : fmtNum(Math.round(doneAvg * 10) / 10)}</b><span>điểm TB</span></div>
        </div>
      </div>
    </section>

    <div class="section-bar"><h2>Bài cần làm <span class="count-pill">${todo.length}</span></h2></div>
    ${todo.length === 0
      ? html`<${EmptyState} icon="check" title="Em đã làm hết bài rồi!" text="Khi có bài mới, bài sẽ hiện ở đây." />`
      : html`<div class="task-grid">${todo.map((a) => html`<${Card} a=${a} />`)}</div>`}

    ${waiting.length > 0 && html`
      <div class="section-bar"><h2>Đã nộp – chờ chấm <span class="count-pill">${waiting.length}</span></h2></div>
      <div class="task-grid">${waiting.map((a) => html`<${Card} a=${a} />`)}</div>`}

    ${done.length > 0 && html`
      <div class="section-bar"><h2>Đã có điểm <span class="count-pill">${done.length}</span></h2></div>
      <div class="task-grid">${done.map((a) => html`<${Card} a=${a} />`)}</div>`}`;
}

// =====================================================================
//  LÀM BÀI
// =====================================================================
export function DoAssignment({ profile, assignmentId }) {
  const [answers, setAnswers] = useState({});
  const [status, setStatus] = useState({}); // qid → 'saving' | 'saved' | 'error'
  const [uploading, setUploading] = useState({}); // qid → số ảnh đang tải
  const [previews, setPreviews] = useState({}); // đường dẫn ảnh → link xem
  const [submitting, setSubmitting] = useState(false);
  const [actionErr, setActionErr] = useState('');
  const ansRef = useRef({});
  const timers = useRef({});
  const dirty = useRef(new Set());
  const inflight = useRef(new Set());

  const [data, err] = useLoad(async () => {
    const sid = await rpc('start_submission', { p_assignment: assignmentId });
    const s = await q(sb.from('submissions').select('id, status').eq('id', sid).single());
    if (s.status !== 'in_progress') { go('/ket-qua/' + sid); return null; }
    const [a, qs, ans] = await Promise.all([
      q(sb.from('assignments').select('id, title, subject, instructions, due_at').eq('id', assignmentId).single()),
      q(sb.from('questions').select('id, position, type, prompt, options, points').eq('assignment_id', assignmentId).order('position')),
      q(sb.from('answers').select('question_id, answer_text, image_paths').eq('submission_id', sid)),
    ]);
    const init = {};
    for (const x of qs) init[x.id] = { text: '', images: [] };
    for (const r of ans) init[r.question_id] = { text: r.answer_text, images: r.image_paths };
    ansRef.current = init;
    setAnswers(init);
    setPreviews(await signedUrls(ans.flatMap((r) => r.image_paths)));
    return { sid, a, qs };
  }, [assignmentId]);

  // Lưu các thay đổi còn dở khi rời trang
  useEffect(() => () => { for (const qid of dirty.current) flush(qid); }, [data]);

  if (err) return html`<${Back} /><${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;
  const { sid, a, qs } = data;

  function flush(qid) {
    clearTimeout(timers.current[qid]);
    if (!dirty.current.has(qid)) return Promise.resolve();
    dirty.current.delete(qid);
    const v = ansRef.current[qid];
    setStatus((s) => ({ ...s, [qid]: 'saving' }));
    const p = rpc('save_answer', { p_submission: sid, p_question: qid, p_text: v.text, p_images: v.images })
      .then(() => setStatus((s) => ({ ...s, [qid]: dirty.current.has(qid) ? 'saving' : 'saved' })))
      .catch((e) => { dirty.current.add(qid); setStatus((s) => ({ ...s, [qid]: 'error' })); setActionErr(e.message); throw e; })
      .finally(() => inflight.current.delete(p));
    inflight.current.add(p);
    return p;
  }

  function update(qid, patch, delay = 800) {
    ansRef.current = { ...ansRef.current, [qid]: { ...ansRef.current[qid], ...patch } };
    setAnswers(ansRef.current);
    dirty.current.add(qid);
    clearTimeout(timers.current[qid]);
    timers.current[qid] = setTimeout(() => flush(qid).catch(() => {}), delay);
  }

  async function addPhotos(qid, files) {
    setActionErr('');
    const list = [...files];
    setUploading((u) => ({ ...u, [qid]: (u[qid] || 0) + list.length }));
    for (const file of list) {
      try {
        const blob = await compressImage(file);
        const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${profile.id}/${sid}/${qid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        await q(sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type || 'image/jpeg' }));
        setPreviews((p) => ({ ...p, [path]: URL.createObjectURL(blob) }));
        update(qid, { images: [...ansRef.current[qid].images, path] }, 0);
      } catch (e) {
        setActionErr('Tải ảnh thất bại: ' + e.message);
      } finally {
        setUploading((u) => ({ ...u, [qid]: u[qid] - 1 }));
      }
    }
  }

  function removePhoto(qid, path) {
    update(qid, { images: ansRef.current[qid].images.filter((p) => p !== path) }, 0);
    sb.storage.from(BUCKET).remove([path]); // dọn ảnh, lỗi cũng không sao
  }

  const isAnswered = (x) => {
    const v = answers[x.id] || {};
    return x.type === 'photo' ? v.images && v.images.length > 0 : (v.text || '').trim() !== '';
  };
  const answeredCount = qs.filter(isAnswered).length;
  const busyUploading = Object.values(uploading).some((n) => n > 0);

  async function submit() {
    const left = qs.length - answeredCount;
    const msg = left > 0
      ? `Em còn ${left} câu chưa làm. Vẫn nộp bài chứ? Nộp rồi sẽ không sửa được nữa.`
      : 'Em chắc chắn muốn nộp bài? Nộp rồi sẽ không sửa được nữa.';
    if (!(await confirmDialog({ title: 'Nộp bài?', message: msg, confirmText: 'Nộp bài', danger: left > 0 }))) return;
    setSubmitting(true); setActionErr('');
    try {
      await Promise.all([...dirty.current].map((qid) => flush(qid)));
      await Promise.all([...inflight.current]);
      await rpc('submit_submission', { p_submission: sid });
      go('/ket-qua/' + sid);
    } catch (e) {
      setActionErr(e.message);
      setSubmitting(false);
    }
  }

  const due = dueInfo(a.due_at, false);

  return html`
    <${Back} label="Danh sách bài" />
    <div class="card">
      <h1>${a.title}</h1>
      <div class="muted small">${a.subject}${due ? html` · <span class=${due.cls}>${due.text}</span>` : ''}</div>
      ${a.instructions && html`<div class="note">💬 ${nl2br(a.instructions)}</div>`}
    </div>

    <div class="progress-sticky">
      <div class="progress-row">
        <div class="progress-track"><div class="progress-fill" style=${`width:${(answeredCount / qs.length) * 100}%`}></div></div>
        <span class="small"><b>${answeredCount}</b>/${qs.length} câu</span>
      </div>
      <div class="q-nav compact" aria-label="Đi tới câu">
        ${qs.map((x, i) => html`<button class=${'q-dot ' + (isAnswered(x) ? 'done' : '')} title=${'Câu ' + (i + 1)}
          onClick=${() => { const el = document.getElementById('q-' + i); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>${i + 1}</button>`)}
      </div>
    </div>

    ${qs.map((x, i) => {
      const v = answers[x.id] || { text: '', images: [] };
      const st = status[x.id];
      return html`
        <div id=${'q-' + i} class=${'card qcard ' + (isAnswered(x) ? 'answered' : '')}>
          <div class="qhead">
            <span class="q-num">${i + 1}</span><span class="tag gray">${TYPE_LABEL[x.type]}</span>
            <span class="spacer"></span>
            <span class="small muted">${st === 'saving' ? 'Đang lưu…' : st === 'saved' ? '✔ Đã lưu' : st === 'error' ? html`<span class="danger">Chưa lưu được</span>` : ''}</span>
            <span class="small muted">${fmtNum(x.points)} điểm</span>
          </div>
          <div class="prompt big-prompt">${nl2br(x.prompt)}</div>

          ${x.type === 'mcq' && html`
            <div class="choices">
              ${x.options.map((o, j) => html`
                <button type="button" class=${'choice ' + (v.text === String(j) ? 'on' : '')}
                        onClick=${() => update(x.id, { text: String(j) }, 0)}>
                  <span class="opt-letter">${String.fromCharCode(65 + j)}</span> ${o}
                </button>`)}
            </div>`}

          ${x.type === 'short' && html`
            <input class="answer-input" value=${v.text} placeholder="Nhập đáp án…" inputmode=${/^[\d\s+\-×:x*/=?.,()]+$/.test(x.prompt) ? 'decimal' : 'text'}
                   onInput=${(e) => update(x.id, { text: e.target.value })} onBlur=${() => flush(x.id).catch(() => {})} />`}

          ${x.type === 'essay' && html`
            <textarea rows="5" class="answer-input" value=${v.text} placeholder="Em viết câu trả lời ở đây…"
                      onInput=${(e) => update(x.id, { text: e.target.value })} onBlur=${() => flush(x.id).catch(() => {})}></textarea>`}

          ${x.type === 'photo' && html`
            <div class="thumbs">
              ${v.images.map((p) => html`
                <div class="thumb">
                  ${previews[p] ? html`<img src=${previews[p]} alt="Ảnh bài làm" />` : html`<div class="thumb-ph">Ảnh</div>`}
                  <button class="thumb-del" title="Xoá ảnh" onClick=${() => removePhoto(x.id, p)}>✕</button>
                </div>`)}
              ${uploading[x.id] > 0 && html`<div class="thumb thumb-ph">Đang tải…</div>`}
            </div>
            <label class="btn photo-btn">
              📷 Chụp / chọn ảnh bài làm
              <input type="file" accept="image/*" multiple hidden
                     onChange=${(e) => { addPhotos(x.id, e.target.files); e.target.value = ''; }} />
            </label>
            <input class="answer-input" value=${v.text} placeholder="Ghi chú thêm (không bắt buộc)"
                   onInput=${(e) => update(x.id, { text: e.target.value })} onBlur=${() => flush(x.id).catch(() => {})} />`}
        </div>`;
    })}

    <${ErrorBox} msg=${actionErr} />
    <div class="save-bar">
      <button class="btn primary big" disabled=${submitting || busyUploading} onClick=${submit}>
        ${submitting ? html`<span class="btn-spin"></span> Đang nộp…` : busyUploading ? 'Đợi ảnh tải xong…' : html`<${Icon} name="send" /> Nộp bài`}
      </button>
    </div>`;
}

// =====================================================================
//  KẾT QUẢ
// =====================================================================
export function ResultView({ id }) {
  const [data, err] = useLoad(async () => {
    const s = await q(sb.from('submissions').select('*, assignments(id, title, subject)').eq('id', id).single());
    const [qs, ans] = await Promise.all([
      q(sb.from('questions').select('*, question_keys(accepted, explanation)').eq('assignment_id', s.assignment_id).order('position')),
      q(sb.from('answers').select('*').eq('submission_id', id)),
    ]);
    const urls = await signedUrls(ans.flatMap((r) => r.image_paths));
    return { s, qs, byQ: Object.fromEntries(ans.map((r) => [r.question_id, r])), urls };
  }, [id]);

  if (err) return html`<${Back} /><${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;
  const { s, qs, byQ, urls } = data;
  const returned = s.status === 'returned';
  const score10 = scoreOn10(s.score, s.max_score);

  if (s.status === 'in_progress') {
    return html`<${Back} /><div class="card center">Em chưa nộp bài này. <a href=${'#/lam/' + s.assignment_id}>Làm tiếp</a></div>`;
  }

  return html`
    <${Back} label="Danh sách bài" />
    <div class="card center result-head">
      <h1>${s.assignments.title}</h1>
      ${returned
        ? html`
          <div class=${'big-score ' + (score10 >= 8 ? 'good' : score10 >= 5 ? 'mid' : 'bad')}>${fmtNum(score10)}<small>/10</small></div>
          <div class="muted">${fmtNum(s.score)} / ${fmtNum(s.max_score)} điểm · ${score10 >= 9 ? 'Xuất sắc! 🌟' : score10 >= 7 ? 'Giỏi lắm! 👍' : score10 >= 5 ? 'Cố gắng thêm nhé! 💪' : 'Xem lại các câu sai nhé! 📖'}</div>
          ${s.teacher_comment && html`<div class="note">💬 ${nl2br(s.teacher_comment)}</div>`}`
        : html`<div class="waiting">⏳ Em đã nộp bài lúc ${fmtDate(s.submitted_at)}.<br />Đang chờ chấm điểm.</div>`}
    </div>

    ${qs.map((x, i) => {
      const ans = byQ[x.id];
      const ok = returned && ans ? ans.is_correct : null;
      return html`
        <div class=${'card qcard ' + (ok === true ? 'right' : ok === false ? 'wrong' : '')}>
          <div class="qhead">
            <b>Câu ${i + 1}</b>
            ${returned && html`<span class=${ok ? 'good-text' : 'danger'}>${ok ? '✔ Đúng' : '✘ Chưa đúng'}</span>`}
            <span class="spacer"></span>
            <span class="small muted">${returned && ans ? `${fmtNum(ans.points_awarded)} / ` : ''}${fmtNum(x.points)} điểm</span>
          </div>
          <div class="prompt">${nl2br(x.prompt)}</div>
          <${AnswerView} q=${x} ans=${ans} k=${returned ? keyOf(x) : null} urls=${urls} showKey=${returned} />
          ${returned && ans && ans.feedback && html`<div class="note small">💬 ${ans.feedback}</div>`}
        </div>`;
    })}`;
}
