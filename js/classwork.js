// Kiểm tra bài làm TRÊN LỚP: chụp ảnh vở → AI kiểm tra từng bài → người giao bài nhận xét
import { html, useState, useEffect, useRef } from './lib.js';
import { sb, q, rpc, ai, signedUrls, BUCKET } from './db.js';
import { useLoad, Loading, ErrorBox, Back, go, fmtDate, fmtNum, Icon, LessonPicker, SUBJECTS, nl2br, confirmDialog, toast, EmptyState, SubjectChip, SubjectIcon, relTime } from './ui.js';
import { compressImage } from './image.js';

const VERDICT = {
  dung: { label: 'Đúng', cls: 'tag green', icon: '✔' },
  sai: { label: 'Sai', cls: 'tag red', icon: '✘' },
  chua_ro: { label: 'Chưa rõ', cls: 'tag gray', icon: '?' },
};
const scoreCls = (s) => (s == null ? '' : s >= 8 ? 'good' : s >= 5 ? 'mid' : 'bad');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------------------------------------------------------------------
//  Danh sách
// ---------------------------------------------------------------------
export function ClassworkList({ profile }) {
  const isTeacher = profile.role === 'teacher';
  const [studentId, setStudentId] = useState('');
  const [data, err] = useLoad(async () => {
    const students = isTeacher
      ? await q(sb.from('profiles').select('id, full_name').eq('teacher_id', profile.id).order('created_at'))
      : [{ id: profile.id, full_name: profile.full_name }];
    const ids = students.map((s) => s.id);
    const items = ids.length
      ? await q(sb.from('classwork').select('id, student_id, subject, lesson, status, score, reviewed_at, created_at, image_paths')
          .in('student_id', ids).order('created_at', { ascending: false }).limit(100))
      : [];
    return { students, items };
  });

  if (err) return html`<${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;
  const names = Object.fromEntries(data.students.map((s) => [s.id, s.full_name]));
  const items = data.items.filter((c) => !studentId || c.student_id === studentId);

  return html`
    <div class="page-head">
      <div>
        <h1>${isTeacher ? 'Bài trên lớp' : 'Kiểm tra bài trên lớp'}</h1>
        <p class="page-sub">${isTeacher ? 'Ảnh bài làm ở trường của các em – AI kiểm tra, bạn nhận xét.' : 'Chụp ảnh vở bài làm ở trường, AI sẽ xem em làm đúng chưa.'}</p>
      </div>
      <button class="btn primary" disabled=${!data.students.length} onClick=${() => go('/tren-lop/moi')}>
        <${Icon} name="camera" /> Kiểm tra bài mới
      </button>
    </div>
    ${isTeacher && data.students.length > 1 && html`
      <div class="chips">
        <button class=${'chip ' + (!studentId ? 'on' : '')} onClick=${() => setStudentId('')}>Tất cả</button>
        ${data.students.map((s) => html`<button class=${'chip ' + (studentId === s.id ? 'on' : '')} onClick=${() => setStudentId(s.id)}>${s.full_name}</button>`)}
      </div>`}
    ${items.length === 0 ? html`
      <div class="empty">
        <div class="empty-ico"><${Icon} name="camera" size=${28} /></div>
        <h3>Chưa có bài nào</h3>
        <p class="muted">Bấm <b>Kiểm tra bài mới</b>, chụp ảnh trang vở bài làm trên lớp và gửi.</p>
      </div>` : html`
      <div class="list">
        ${items.map((c) => html`
          <a class="item" href=${'#/tren-lop/' + c.id}>
            <${SubjectIcon} subject=${c.subject} />
            <div class="item-main">
              <div class="item-title">${c.subject}${c.lesson ? ' · ' + c.lesson : ''}</div>
              <div class="small muted">${isTeacher && data.students.length > 1 ? names[c.student_id] + ' · ' : ''}${relTime(c.created_at)} · ${c.image_paths.length} ảnh</div>
            </div>
            <div class="item-side">
              ${c.status === 'checked' && c.score != null && html`<span class=${'score ' + scoreCls(Number(c.score))}>${fmtNum(c.score)}<small>/10</small></span>`}
              ${c.status !== 'checked' ? html`<span class="tag orange">Chờ AI</span>`
                : c.reviewed_at ? html`<span class="tag green">Đã nhận xét</span>`
                : html`<span class="tag blue">${isTeacher ? 'Chưa nhận xét' : 'AI đã kiểm tra'}</span>`}
            </div>
          </a>`)}
      </div>`}`;
}

// ---------------------------------------------------------------------
//  Gửi bài mới
// ---------------------------------------------------------------------
export function ClassworkNew({ profile }) {
  const isTeacher = profile.role === 'teacher';
  const [studentId, setStudentId] = useState(isTeacher ? '' : profile.id);
  const [subject, setSubject] = useState('Toán');
  const [lesson, setLesson] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState([]); // { blob, url }
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [students] = useLoad(async () => {
    if (!isTeacher) return [];
    const s = await q(sb.from('profiles').select('id, full_name').eq('teacher_id', profile.id).order('created_at'));
    if (s[0]) setStudentId((cur) => cur || s[0].id);
    return s;
  });

  async function addFiles(list) {
    setErr('');
    const arr = [...list].slice(0, 8 - files.length);
    for (const f of arr) {
      const blob = await compressImage(f);
      setFiles((x) => [...x, { blob, url: URL.createObjectURL(blob) }]);
    }
  }

  async function submit() {
    setErr('');
    if (!studentId) { setErr('Hãy chọn học sinh.'); return; }
    if (!files.length) { setErr('Hãy chụp ít nhất 1 ảnh bài làm.'); return; }
    try {
      setBusy('Đang tải ảnh lên…');
      const folder = `${studentId}/lop-${uuid()}`;
      const paths = [];
      for (const [i, f] of files.entries()) {
        const path = `${folder}/${i + 1}.jpg`;
        await q(sb.storage.from(BUCKET).upload(path, f.blob, { contentType: f.blob.type || 'image/jpeg' }));
        paths.push(path);
      }
      setBusy('Đang lưu…');
      const id = await rpc('create_classwork', { p_student: studentId, p_subject: subject, p_lesson: lesson, p_note: note, p_images: paths });
      sessionStorage.setItem('auto-check', id);
      go('/tren-lop/' + id);
    } catch (e) {
      setErr(e.message);
      setBusy('');
    }
  }

  return html`
    <${Back} to="/tren-lop" />
    <div class="page-head"><div>
      <h1>Kiểm tra bài trên lớp</h1>
      <p class="page-sub">Chụp rõ từng trang vở, đủ ánh sáng, không bị nghiêng.</p>
    </div></div>
    <div class="two-col">
      <div class="card stack">
        ${isTeacher && html`
          <label>Học sinh
            <select value=${studentId} onChange=${(e) => setStudentId(e.target.value)}>
              ${(students || []).map((s) => html`<option value=${s.id}>${s.full_name}</option>`)}
            </select>
          </label>`}
        <${LessonPicker} subject=${subject} onPick=${(p) => { setSubject(p.subject || 'Khác'); setLesson(p.lesson || p.chapter || ''); }} />
        ${!SUBJECTS.includes(subject) && html`<p class="small muted">Môn: ${subject}</p>`}
        <label>Ghi chú (không bắt buộc)
          <textarea rows="2" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="VD: Bài 3, 4 trang 35 cô giao trên lớp"></textarea>
        </label>
      </div>
      <div class="card stack">
        <div class="card-title"><${Icon} name="camera" /> Ảnh bài làm <span class="muted small">(${files.length}/8)</span></div>
        <div class="thumbs">
          ${files.map((f, i) => html`
            <div class="thumb"><img src=${f.url} alt=${'Ảnh ' + (i + 1)} />
              <button class="thumb-del" title="Bỏ ảnh" onClick=${() => setFiles((x) => x.filter((_, j) => j !== i))}>✕</button></div>`)}
        </div>
        ${files.length < 8 && html`
          <label class="dropzone">
            <${Icon} name="camera" size=${26} />
            <b>Chụp / chọn ảnh</b><span class="small muted">Có thể chọn nhiều ảnh</span>
            <input type="file" accept="image/*" multiple hidden onChange=${(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>`}
      </div>
    </div>
    <${ErrorBox} msg=${err} />
    <div class="save-bar">
      <button class="btn primary lg" disabled=${!!busy || !files.length} onClick=${submit}>
        ${busy || html`<${Icon} name="sparkles" /> Gửi để AI kiểm tra`}
      </button>
    </div>`;
}

// ---------------------------------------------------------------------
//  Chi tiết + kết quả AI + nhận xét
// ---------------------------------------------------------------------
export function ClassworkDetail({ id, profile }) {
  const isTeacher = profile.role === 'teacher';
  const [checking, setChecking] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const auto = useRef(false);

  const [data, err, reload] = useLoad(async () => {
    const c = await q(sb.from('classwork').select('*').eq('id', id).single());
    const st = await q(sb.from('profiles').select('full_name').eq('id', c.student_id).maybeSingle());
    const urls = await signedUrls(c.image_paths);
    setComment(c.teacher_comment || '');
    return { c, urls, studentName: st ? st.full_name : '' };
  }, [id]);

  async function runCheck() {
    setChecking(true); setAiErr('');
    try { await ai({ action: 'check_classwork', classwork_id: id }); reload(); }
    catch (e) { setAiErr(e.message); }
    setChecking(false);
  }

  // Vừa gửi bài xong → tự chạy AI một lần
  useEffect(() => {
    if (data && !auto.current && data.c.status === 'pending' && sessionStorage.getItem('auto-check') === id) {
      auto.current = true;
      sessionStorage.removeItem('auto-check');
      runCheck();
    }
  }, [data]);

  if (err) return html`<${Back} to="/tren-lop" /><${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;
  const { c, urls, studentName } = data;
  const r = c.ai_result;
  const counts = r ? r.items.reduce((t, it) => ((t[it.verdict] = (t[it.verdict] || 0) + 1), t), {}) : {};
  const canDelete = c.created_by === profile.id || isTeacher;

  async function saveComment() {
    setMsg('');
    try { await rpc('review_classwork', { p_id: id, p_comment: comment }); toast('Đã lưu nhận xét.'); reload(); }
    catch (e) { setMsg(e.message); }
  }
  async function remove() {
    if (!(await confirmDialog({ title: 'Xoá bài kiểm tra?', danger: true, confirmText: 'Xoá', message: 'Ảnh và kết quả AI của bài này sẽ bị xoá.' }))) return;
    try {
      await rpc('delete_classwork', { p_id: id });
      sb.storage.from(BUCKET).remove(c.image_paths);
      go('/tren-lop');
    } catch (e) { setMsg(e.message); }
  }

  return html`
    <${Back} to="/tren-lop" />
    <div class="page-head">
      <div>
        <h1>${c.subject}${c.lesson ? ' · ' + c.lesson : ''}</h1>
        <p class="page-sub">${isTeacher ? studentName + ' · ' : ''}Gửi ${fmtDate(c.created_at)}</p>
      </div>
      <div class="row">
        ${c.status === 'checked' && html`<button class="btn" disabled=${checking} onClick=${runCheck}><${Icon} name="sparkles" /> Kiểm tra lại</button>`}
        ${canDelete && html`<button class="btn danger-outline" onClick=${remove}><${Icon} name="trash" /> Xoá</button>`}
      </div>
    </div>

    <div class="two-col wide-right">
      <div class="card">
        <div class="card-title"><${Icon} name="camera" /> Ảnh bài làm</div>
        <div class="photo-grid">
          ${c.image_paths.map((p) => urls[p] && html`<a href=${urls[p]} target="_blank" rel="noopener"><img src=${urls[p]} alt="Ảnh bài làm" /></a>`)}
        </div>
        ${c.note && html`<div class="note small">📝 ${c.note}</div>`}
      </div>

      <div class="stack">
        ${checking ? html`<div class="card center ai-working"><div class="spinner"></div><b>AI đang đọc vở và kiểm tra từng bài…</b><p class="small muted">Thường mất 10–40 giây.</p></div>`
        : c.status !== 'checked' ? html`
          <div class="card center">
            <p>Bài chưa được AI kiểm tra.</p>
            <button class="btn primary" onClick=${runCheck}><${Icon} name="sparkles" /> AI kiểm tra ngay</button>
          </div>` : html`
          <div class="card result-summary">
            <div class=${'big-score ' + scoreCls(c.score == null ? null : Number(c.score))}>${c.score == null ? '–' : fmtNum(c.score)}<small>/10</small></div>
            <div class="summary-counts">
              <span class="tag green">✔ ${counts.dung || 0} đúng</span>
              <span class="tag red">✘ ${counts.sai || 0} sai</span>
              ${counts.chua_ro ? html`<span class="tag gray">? ${counts.chua_ro} chưa rõ</span>` : ''}
            </div>
            ${!r.readable && html`<div class="alert warn">AI khó đọc ảnh. Hãy chụp lại rõ hơn rồi bấm "Kiểm tra lại".</div>`}
            ${r.strengths && html`<p><b>Điểm mạnh:</b> ${r.strengths}</p>`}
            ${r.improve && html`<p><b>Cần cải thiện:</b> ${r.improve}</p>`}
            ${r.encourage && html`<div class="note">💬 ${r.encourage}</div>`}
            <p class="small muted">Điểm do AI ước lượng – có thể chưa chính xác.</p>
          </div>
          ${r.items.map((it) => html`
            <div class=${'card qcard ' + (it.verdict === 'dung' ? 'right' : it.verdict === 'sai' ? 'wrong' : '')}>
              <div class="qhead"><b>${it.label}</b><span class=${VERDICT[it.verdict].cls}>${VERDICT[it.verdict].icon} ${VERDICT[it.verdict].label}</span></div>
              ${it.question && html`<div class="prompt">${nl2br(it.question)}</div>`}
              ${it.student_answer && html`<div class="answer-text"><span class="muted small">Bài làm của em:</span><br />${nl2br(it.student_answer)}</div>`}
              ${it.verdict !== 'dung' && it.correct_answer && html`<div class="key small"><b>Đáp án đúng:</b> ${nl2br(it.correct_answer)}</div>`}
              ${it.explanation && html`<div class="key small">${nl2br(it.explanation)}</div>`}
            </div>`)}`}
        <${ErrorBox} msg=${aiErr} />

        <div class="card">
          <div class="card-title"><${Icon} name="edit" /> Nhận xét của người giao bài</div>
          ${isTeacher ? html`
            <textarea rows="3" value=${comment} onInput=${(e) => setComment(e.target.value)} placeholder="VD: Em làm tốt, nhớ trình bày lời giải đầy đủ nhé!"></textarea>
            <div class="row end"><button class="btn primary" onClick=${saveComment}>Lưu nhận xét</button></div>
            ${msg && html`<div class="alert ok">${msg}</div>`}`
          : c.teacher_comment ? html`<div class="note">💬 ${nl2br(c.teacher_comment)}</div>` : html`<p class="muted small">Chưa có nhận xét.</p>`}
        </div>
      </div>
    </div>`;
}
