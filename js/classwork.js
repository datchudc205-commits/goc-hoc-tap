// Kiểm tra bài làm TRÊN LỚP: chụp ảnh vở → AI kiểm tra từng bài → người giao bài nhận xét
import { html, useState, useEffect, useRef } from './lib.js';
import { sb, q, rpc, ai, signedUrls, BUCKET } from './db.js';
import { useLoad, Loading, ErrorBox, Back, go, fmtDate, fmtNum, Icon, LessonPicker, SUBJECTS, nl2br, plainMath, confirmDialog, toast, EmptyState, SubjectChip, SubjectIcon, relTime } from './ui.js';
import { compressImage } from './image.js';

const VERDICT = {
  dung: { label: 'Đúng', cls: 'tag green', icon: '✔' },
  sai: { label: 'Sai', cls: 'tag red', icon: '✘' },
  chua_ro: { label: 'Chưa rõ', cls: 'tag gray', icon: '?' },
  chua_lam: { label: 'Chưa làm', cls: 'tag orange', icon: '○' },
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


// Ô chọn ảnh dùng chung (ảnh đề bài / ảnh bài làm)
function PhotoPicker({ title, icon = 'camera', hint, files, setFiles, max, tone = '' }) {
  async function addFiles(list) {
    const arr = [...list].slice(0, max - files.length);
    for (const f of arr) {
      const blob = await compressImage(f);
      setFiles((x) => (x.length >= max ? x : [...x, { blob, url: URL.createObjectURL(blob) }]));
    }
  }
  return html`
    <div class=${'card stack ' + tone}>
      <div class="card-title"><${Icon} name=${icon} /> ${title} <span class="muted small">(${files.length}/${max})</span></div>
      ${hint && html`<p class="small muted" style="margin:0">${hint}</p>`}
      ${files.length > 0 && html`<div class="thumbs">
        ${files.map((f, i) => html`
          <div class="thumb"><img src=${f.url} alt=${title + ' ' + (i + 1)} />
            <button class="thumb-del" title="Bỏ ảnh" onClick=${() => setFiles((x) => x.filter((_, j) => j !== i))}>✕</button></div>`)}
      </div>`}
      ${files.length < max && html`
        <label class="dropzone">
          <${Icon} name="camera" size=${26} />
          <b>Chụp / chọn ảnh</b><span class="small muted">Có thể chọn nhiều ảnh</span>
          <input type="file" accept="image/*" multiple hidden onChange=${(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>`}
    </div>`;
}

async function uploadAll(folder, files, prefix) {
  const paths = [];
  for (const [i, f] of files.entries()) {
    const path = `${folder}/${prefix}${i + 1}.jpg`;
    await q(sb.storage.from(BUCKET).upload(path, f.blob, { contentType: f.blob.type || 'image/jpeg' }));
    paths.push(path);
  }
  return paths;
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
  const [deFiles, setDeFiles] = useState([]); // ảnh đề bài
  const [files, setFiles] = useState([]); // ảnh bài làm
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [students] = useLoad(async () => {
    if (!isTeacher) return [];
    const s = await q(sb.from('profiles').select('id, full_name').eq('teacher_id', profile.id).order('created_at'));
    if (s[0]) setStudentId((cur) => cur || s[0].id);
    return s;
  });

  async function submit() {
    setErr('');
    if (!studentId) { setErr('Hãy chọn học sinh.'); return; }
    if (!files.length) { setErr('Hãy chụp ít nhất 1 ảnh bài làm.'); return; }
    try {
      setBusy('Đang tải ảnh lên…');
      const folder = `${studentId}/lop-${uuid()}`;
      const dePaths = await uploadAll(folder, deFiles, 'de-');
      const paths = await uploadAll(folder, files, '');
      setBusy('Đang lưu…');
      const id = await rpc('create_classwork', { p_student: studentId, p_subject: subject, p_lesson: lesson, p_note: note, p_images: paths, p_problem_images: dePaths });
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
      <p class="page-sub">Chụp rõ từng trang, đủ ánh sáng, không bị nghiêng.</p>
    </div></div>
    <ol class="cw-steps">
      <li class=${deFiles.length ? 'done' : ''}><b>1</b><span>Ảnh đề bài <i>(nên có)</i></span></li>
      <li class=${files.length ? 'done' : ''}><b>2</b><span>Ảnh bài làm</span></li>
      <li><b>3</b><span>AI đọc đề → kiểm tra bài</span></li>
    </ol>
    <div class="card cw-form">
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
    <div class="two-col">
      <${PhotoPicker} title="① Ảnh đề bài" icon="file" max=${4} files=${deFiles} setFiles=${setDeFiles} tone="de-card"
        hint="Chụp trang sách, phiếu bài tập hoặc bảng có đề. AI sẽ đọc đề TRƯỚC rồi mới chấm, nên chấm chính xác hơn và biết em còn sót bài nào. Đề đã chép trong vở thì có thể bỏ qua." />
      <${PhotoPicker} title="② Ảnh bài làm" max=${8} files=${files} setFiles=${setFiles}
        hint="Chụp các trang vở em đã làm." />
    </div>
    <${ErrorBox} msg=${err} />
    <div class="save-bar">
      <button class="btn primary lg" disabled=${!!busy || !files.length} onClick=${submit}>
        ${busy || html`<${Icon} name="sparkles" /> ${deFiles.length ? 'Gửi – AI đọc đề rồi kiểm tra' : 'Gửi để AI kiểm tra'}`}
      </button>
    </div>`;
}

// ---------------------------------------------------------------------
//  Đề bài AI đọc được (xem, sửa, đọc lại, thêm ảnh đề)
// ---------------------------------------------------------------------
function ProblemCard({ c, urls, busy, onScan, onSaved, onAddImages }) {
  const [edit, setEdit] = useState(null); // mảng đang sửa
  const [adding, setAdding] = useState(false);
  const problems = Array.isArray(c.problems) ? c.problems : null;
  const has = c.problem_paths.length > 0;

  async function save() {
    const list = edit.map((p) => ({ label: p.label.trim() || 'Bài', text: p.text.trim() })).filter((p) => p.text);
    try { await rpc('save_classwork_problems', { p_id: c.id, p_problems: list }); setEdit(null); onSaved(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function addFiles(list) {
    setAdding(true);
    try {
      const blobs = [];
      for (const f of [...list].slice(0, 4)) blobs.push({ blob: await compressImage(f) });
      await onAddImages(blobs);
    } catch (e) { toast(e.message, 'error'); }
    setAdding(false);
  }
  const fileInput = (label) => html`
    <label class="btn sm">
      <${Icon} name="camera" size=${15} /> ${adding ? 'Đang tải…' : label}
      <input type="file" accept="image/*" multiple hidden disabled=${adding || busy} onChange=${(e) => { addFiles(e.target.files); e.target.value = ''; }} />
    </label>`;

  if (!has) return html`
    <div class="card de-card de-empty">
      <div class="card-title"><${Icon} name="file" /> Ảnh đề bài</div>
      <p class="small muted">Chưa có ảnh đề. Thêm ảnh trang sách / phiếu bài tập để AI đọc đề trước rồi chấm lại chính xác hơn.</p>
      ${fileInput('Thêm ảnh đề bài')}
    </div>`;

  return html`
    <div class="card de-card">
      <div class="card-title row-between">
        <span><${Icon} name="file" /> Đề bài ${problems ? html`<span class="tag green">AI đã đọc ${problems.length} bài</span>` : html`<span class="tag orange">Chưa đọc</span>`}</span>
      </div>
      <div class="photo-grid small-grid">
        ${c.problem_paths.map((p) => urls[p] && html`<a href=${urls[p]} target="_blank" rel="noopener"><img src=${urls[p]} alt="Ảnh đề bài" /></a>`)}
      </div>
      ${edit ? html`
        <div class="stack">
          ${edit.map((p, i) => html`
            <div class="de-edit">
              <input value=${p.label} onInput=${(e) => setEdit(edit.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <textarea rows="3" value=${p.text} onInput=${(e) => setEdit(edit.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}></textarea>
              <button class="btn sm ghost" title="Bỏ bài này" onClick=${() => setEdit(edit.filter((_, j) => j !== i))}><${Icon} name="trash" size=${15} /></button>
            </div>`)}
          <button class="btn sm" onClick=${() => setEdit([...edit, { label: 'Bài ' + (edit.length + 1), text: '' }])}><${Icon} name="plus" size=${15} /> Thêm bài</button>
          <div class="row end">
            <button class="btn sm" onClick=${() => setEdit(null)}>Huỷ</button>
            <button class="btn sm primary" onClick=${save}>Lưu đề</button>
          </div>
        </div>`
      : problems ? html`
        <ol class="de-list">
          ${problems.map((p) => html`<li><b>${p.label}</b><div>${nl2br(plainMath(p.text))}</div></li>`)}
        </ol>
        <p class="small muted">AI đọc đề có thể nhầm số. Nếu thấy sai, bấm <b>Sửa đề</b> rồi <b>Kiểm tra lại</b>.</p>` : ''}
      ${!edit && html`<div class="row">
        ${problems && html`<button class="btn sm" disabled=${busy} onClick=${() => setEdit(problems.map((p) => ({ ...p })))}><${Icon} name="edit" size=${15} /> Sửa đề</button>`}
        <button class="btn sm" disabled=${busy} onClick=${onScan}><${Icon} name="sparkles" size=${15} /> ${problems ? 'Đọc lại đề' : 'AI đọc đề'}</button>
        ${fileInput('Đổi ảnh đề')}
      </div>`}
    </div>`;
}

// ---------------------------------------------------------------------
//  Chi tiết + kết quả AI + nhận xét
// ---------------------------------------------------------------------
export function ClassworkDetail({ id, profile }) {
  const isTeacher = profile.role === 'teacher';
  const [phase, setPhase] = useState(''); // '' | 'scan' | 'check'
  const [aiErr, setAiErr] = useState('');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const auto = useRef(false);

  const [data, err, reload] = useLoad(async () => {
    const c = await q(sb.from('classwork').select('*').eq('id', id).single());
    c.problem_paths = c.problem_paths || [];
    const st = await q(sb.from('profiles').select('full_name').eq('id', c.student_id).maybeSingle());
    const urls = await signedUrls([...c.problem_paths, ...c.image_paths]);
    setComment(c.teacher_comment || '');
    return { c, urls, studentName: st ? st.full_name : '' };
  }, [id]);

  // Bước 1 (nếu có ảnh đề và chưa đọc): AI đọc đề. Bước 2: AI kiểm tra bài làm theo đề.
  async function runCheck({ rescan = false } = {}) {
    setAiErr('');
    try {
      const c = data.c;
      if (c.problem_paths.length && (rescan || !Array.isArray(c.problems))) {
        setPhase('scan');
        await ai({ action: 'scan_problem', classwork_id: id });
      }
      setPhase('check');
      await ai({ action: 'check_classwork', classwork_id: id });
    } catch (e) { setAiErr(e.message); }
    setPhase('');
    reload();
  }
  async function scanOnly() {
    setAiErr(''); setPhase('scan');
    try { await ai({ action: 'scan_problem', classwork_id: id }); toast('AI đã đọc lại đề. Bấm "Kiểm tra lại" để chấm theo đề này.'); }
    catch (e) { setAiErr(e.message); }
    setPhase(''); reload();
  }
  async function addProblemImages(blobs) {
    const c = data.c;
    const folder = c.image_paths[0].split('/').slice(0, -1).join('/');
    const paths = await uploadAll(folder, blobs, `de-${Date.now().toString(36)}-`);
    const old = c.problem_paths;
    await rpc('set_classwork_problem_images', { p_id: id, p_images: paths });
    if (old.length) sb.storage.from(BUCKET).remove(old);
    data.c.problem_paths = paths; data.c.problems = null;
    await runCheck();
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
  const busy = !!phase;
  const hasDe = c.problem_paths.length > 0;

  async function saveComment() {
    setMsg('');
    try { await rpc('review_classwork', { p_id: id, p_comment: comment }); toast('Đã lưu nhận xét.'); reload(); }
    catch (e) { setMsg(e.message); }
  }
  async function remove() {
    if (!(await confirmDialog({ title: 'Xoá bài kiểm tra?', danger: true, confirmText: 'Xoá', message: 'Ảnh và kết quả AI của bài này sẽ bị xoá.' }))) return;
    try {
      await rpc('delete_classwork', { p_id: id });
      sb.storage.from(BUCKET).remove([...c.image_paths, ...c.problem_paths]);
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
        ${c.status === 'checked' && html`<button class="btn" disabled=${busy} onClick=${() => runCheck()}><${Icon} name="sparkles" /> Kiểm tra lại</button>`}
        ${canDelete && html`<button class="btn danger-outline" onClick=${remove}><${Icon} name="trash" /> Xoá</button>`}
      </div>
    </div>

    <div class="two-col wide-right">
      <div class="stack">
        <${ProblemCard} c=${c} urls=${urls} busy=${busy} onScan=${scanOnly} onAddImages=${addProblemImages}
          onSaved=${() => { toast('Đã lưu đề. Bấm "Kiểm tra lại" để AI chấm theo đề này.'); reload(); }} />
        <div class="card">
          <div class="card-title"><${Icon} name="camera" /> Ảnh bài làm</div>
          <div class="photo-grid">
            ${c.image_paths.map((p) => urls[p] && html`<a href=${urls[p]} target="_blank" rel="noopener"><img src=${urls[p]} alt="Ảnh bài làm" /></a>`)}
          </div>
          ${c.note && html`<div class="note small">📝 ${c.note}</div>`}
        </div>
      </div>

      <div class="stack">
        ${busy ? html`
          <div class="card center ai-working">
            <div class="spinner"></div>
            <ol class="ai-steps">
              ${hasDe && html`<li class=${phase === 'scan' ? 'now' : 'ok'}>${phase === 'scan' ? '⏳ Bước 1: AI đang đọc đề bài' : '✔ Bước 1: Đã đọc đề bài'}</li>`}
              <li class=${phase === 'check' ? 'now' : ''}>${phase === 'check' ? '⏳' : '•'} Bước ${hasDe ? 2 : 1}: AI kiểm tra từng bài trong vở</li>
            </ol>
            <p class="small muted">Thường mất 10–40 giây mỗi bước.</p>
          </div>`
        : c.status !== 'checked' ? html`
          <div class="card center">
            <p>Bài chưa được AI kiểm tra.</p>
            <button class="btn primary" onClick=${() => runCheck()}><${Icon} name="sparkles" /> ${hasDe ? 'AI đọc đề rồi kiểm tra' : 'AI kiểm tra ngay'}</button>
          </div>` : html`
          <div class="card result-summary">
            <div class=${'big-score ' + scoreCls(c.score == null ? null : Number(c.score))}>${c.score == null ? '–' : fmtNum(c.score)}<small>/10</small></div>
            <div class="summary-counts">
              <span class="tag green">✔ ${counts.dung || 0} đúng</span>
              <span class="tag red">✘ ${counts.sai || 0} sai</span>
              ${counts.chua_lam ? html`<span class="tag orange">○ ${counts.chua_lam} chưa làm</span>` : ''}
              ${counts.chua_ro ? html`<span class="tag gray">? ${counts.chua_ro} chưa rõ</span>` : ''}
            </div>
            ${r.with_problems && html`<p class="small muted center">📄 Đã chấm theo đề bài AI đọc từ ảnh đề.</p>`}
            ${!r.readable && html`<div class="alert warn">AI khó đọc ảnh. Hãy chụp lại rõ hơn rồi bấm "Kiểm tra lại".</div>`}
            ${r.strengths && html`<p><b>Điểm mạnh:</b> ${plainMath(r.strengths)}</p>`}
            ${r.improve && html`<p><b>Cần cải thiện:</b> ${plainMath(r.improve)}</p>`}
            ${r.encourage && html`<div class="note">💬 ${r.encourage}</div>`}
            <p class="small muted">Điểm do AI ước lượng – có thể chưa chính xác.</p>
          </div>
          ${r.items.map((it) => { const v = VERDICT[it.verdict] || VERDICT.chua_ro; return html`
            <div class=${'card qcard ' + (it.verdict === 'dung' ? 'right' : it.verdict === 'sai' ? 'wrong' : '')}>
              <div class="qhead"><b>${it.label}</b><span class=${v.cls}>${v.icon} ${v.label}</span></div>
              ${it.question && html`<div class="prompt">${nl2br(plainMath(it.question))}</div>`}
              ${it.student_answer && html`<div class="answer-text"><span class="muted small">Bài làm của em:</span><br />${nl2br(plainMath(it.student_answer))}</div>`}
              ${it.verdict !== 'dung' && it.correct_answer && html`<div class="key small"><b>Đáp án đúng:</b> ${nl2br(plainMath(it.correct_answer))}</div>`}
              ${it.explanation && html`<div class="key small">${nl2br(plainMath(it.explanation))}</div>`}
            </div>`; })}`}
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
