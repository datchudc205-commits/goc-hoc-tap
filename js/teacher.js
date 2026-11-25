import { html, useState, useMemo } from './lib.js';
import { sb, q, rpc, signedUrls, ai } from './db.js';
import {
  useLoad, Loading, ErrorBox, Back, go, TYPE_LABEL, SUBJECTS, fmtDate, fmtNum, dueInfo,
  scoreOn10, ScoreBadge, statusOf, nl2br,
} from './ui.js';
import { generateMath, OPS } from './mathgen.js';

export const keyOf = (row) => (Array.isArray(row.question_keys) ? row.question_keys[0] : row.question_keys) || { accepted: [], explanation: '' };

// =====================================================================
//  TRANG CHÍNH: danh sách bài đã giao
// =====================================================================
export function TeacherHome({ profile }) {
  const [filter, setFilter] = useState('all');
  const [data, err] = useLoad(async () => {
    const [students, assignments] = await Promise.all([
      q(sb.from('profiles').select('id, full_name').eq('teacher_id', profile.id).order('created_at')),
      q(sb.from('assignments')
        .select('id, title, subject, due_at, published, created_at, student_id, submissions(id, status, score, max_score, submitted_at)')
        .eq('teacher_id', profile.id)
        .order('created_at', { ascending: false })),
    ]);
    return { students, assignments };
  });

  if (err) return html`<${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;

  const { students, assignments } = data;
  const names = Object.fromEntries(students.map((s) => [s.id, s.full_name]));
  const withStatus = assignments.map((a) => ({ ...a, st: statusOf(a) }));
  const counts = withStatus.reduce((c, a) => ((c[a.st.key] = (c[a.st.key] || 0) + 1), c), {});
  const FILTERS = [
    ['all', 'Tất cả', assignments.length],
    ['submitted', 'Chờ chấm', counts.submitted || 0],
    ['open', 'Đang giao', (counts.assigned || 0) + (counts.doing || 0)],
    ['returned', 'Đã trả', counts.returned || 0],
    ['draft', 'Nháp', counts.draft || 0],
  ];
  const shown = withStatus.filter((a) =>
    filter === 'all' ? true : filter === 'open' ? ['assigned', 'doing'].includes(a.st.key) : a.st.key === filter);

  return html`
    ${students.length === 0 && html`<${InviteCard} profile=${profile} first />`}

    <div class="page-head">
      <h1>Bài tập đã giao</h1>
      <button class="btn primary" disabled=${!students.length} onClick=${() => go('/bai/moi')}>+ Giao bài mới</button>
    </div>

    ${counts.submitted > 0 && html`
      <div class="alert warn clickable" onClick=${() => setFilter('submitted')}>
        📝 Có <b>${counts.submitted}</b> bài đang chờ bạn chấm.
      </div>`}

    <div class="chips">
      ${FILTERS.map(([k, label, n]) => html`
        <button class=${'chip ' + (filter === k ? 'on' : '')} onClick=${() => setFilter(k)}>${label} <small>${n}</small></button>`)}
    </div>

    ${shown.length === 0 && html`<div class="card center muted">Chưa có bài nào ở đây.</div>`}

    <div class="list">
      ${shown.map((a) => {
        const s = a.submissions[0];
        const href = s ? `#/cham/${s.id}` : `#/bai/${a.id}`;
        const due = dueInfo(a.due_at, s && s.status !== 'in_progress');
        return html`
          <a class="item" href=${href}>
            <div class="item-main">
              <div class="item-title">${a.title}</div>
              <div class="small muted">
                ${a.subject}${students.length > 1 ? ` · ${names[a.student_id] || ''}` : ''}
                ${due && html` · <span class=${due.cls}>${due.text}</span>`}
              </div>
            </div>
            <div class="item-side">
              ${s && s.status === 'returned' ? html`<${ScoreBadge} score=${s.score} max=${s.max_score} />` : ''}
              <span class=${a.st.cls}>${a.st.label}</span>
            </div>
          </a>`;
      })}
    </div>

    ${students.length > 0 && html`<${InviteCard} profile=${profile} students=${students} />`}`;
}

function InviteCard({ profile, first, students = [] }) {
  const [copied, setCopied] = useState(false);
  const appUrl = location.origin + location.pathname;
  const message = `Em mở ${appUrl} → chọn "Tạo tài khoản" → "Học sinh", rồi nhập mã mời: ${profile.invite_code}`;
  async function copy() {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { prompt('Sao chép tin nhắn này:', message); }
  }
  return html`
    <div class=${'card invite ' + (first ? 'highlight' : '')}>
      ${first
        ? html`<h2>Bước đầu tiên: mời em vào app</h2>
               <p>Gửi tin nhắn dưới đây cho em qua Zalo/Messenger. Em tạo tài khoản xong là bạn giao bài được ngay.</p>`
        : html`<div class="small muted">Học sinh: ${students.map((s) => s.full_name).join(', ')} · Mã mời của bạn:</div>`}
      <div class="row wrap-row">
        <span class="code">${profile.invite_code}</span>
        <button class="btn" onClick=${copy}>${copied ? '✔ Đã chép' : 'Chép tin nhắn mời'}</button>
      </div>
      ${first && html`<p class="small muted">${message}</p>`}
    </div>`;
}

// =====================================================================
//  SOẠN BÀI (tạo mới / sửa / nhân bản)
// =====================================================================
let uidSeq = 0;
const newUid = () => `q${++uidSeq}`;

function blankQuestion(type) {
  return {
    uid: newUid(), type, prompt: '', points: 1, explanation: '',
    options: type === 'mcq' ? ['', '', '', ''] : [], correct: type === 'mcq' ? 0 : null, acceptedText: '',
  };
}

function fromDb(row) {
  const k = keyOf(row);
  return {
    uid: newUid(),
    type: row.type,
    prompt: row.prompt,
    points: Number(row.points),
    explanation: k.explanation || '',
    options: row.type === 'mcq' ? [...row.options] : [],
    correct: row.type === 'mcq' ? Number(k.accepted[0] || 0) : null,
    acceptedText: row.type === 'short' ? k.accepted.join('\n') : '',
  };
}

// Câu hỏi từ bộ sinh đề toán hoặc từ AI → dạng của trình soạn bài
function fromGenerated(g) {
  return {
    ...blankQuestion(g.type),
    prompt: g.prompt,
    points: g.points,
    explanation: g.explanation || '',
    options: g.type === 'mcq' ? [...g.options] : [],
    correct: g.type === 'mcq' ? Number(g.accepted[0]) : null,
    acceptedText: g.type === 'short' ? g.accepted.join('\n') : '',
  };
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentEditor({ profile, id, copyFrom }) {
  const src = id || copyFrom;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const [data, err] = useLoad(async () => {
    const students = await q(sb.from('profiles').select('id, full_name').eq('teacher_id', profile.id).order('created_at'));
    let f = {
      title: '', subject: SUBJECTS[0], instructions: '', due_at: '', student_id: students[0] ? students[0].id : '',
      published: false, questions: [blankQuestion('short')],
    };
    let subs = [];
    if (src) {
      const a = await q(sb.from('assignments').select('*, submissions(id, status)').eq('id', src).single());
      const qs = await q(sb.from('questions').select('*, question_keys(accepted, explanation)')
        .eq('assignment_id', src).order('position'));
      f = {
        title: copyFrom ? `${a.title} (bản sao)` : a.title,
        subject: a.subject, instructions: a.instructions,
        due_at: copyFrom ? '' : toLocalInput(a.due_at),
        student_id: a.student_id, published: copyFrom ? false : a.published,
        questions: qs.map(fromDb),
      };
      if (id) subs = a.submissions;
    }
    setForm(f);
    return { students, subs };
  }, [src]);

  if (err) return html`<${Back} /><${ErrorBox} msg=${err} />`;
  if (!data || !form) return html`<${Loading} />`;

  const locked = data.subs.length > 0;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setQ = (i, patch) => setForm((f) => ({ ...f, questions: f.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const moveQ = (i, d) => setForm((f) => {
    const qs = [...f.questions]; const j = i + d;
    if (j < 0 || j >= qs.length) return f;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    return { ...f, questions: qs };
  });
  const removeQ = (i) => setForm((f) => ({ ...f, questions: f.questions.filter((_, j) => j !== i) }));
  const addQ = (items) => setForm((f) => ({
    ...f,
    // bỏ câu trống mặc định nếu người dùng chưa gõ gì
    questions: [...f.questions.filter((x) => x.prompt.trim() || f.questions.length > 1), ...items],
  }));

  const totalPoints = form.questions.reduce((s, x) => s + (Number(x.points) || 0), 0);

  async function save(published) {
    setSaving(true); setSaveErr('');
    try {
      const payload = {
        id: id || null,
        title: form.title, subject: form.subject, instructions: form.instructions,
        student_id: form.student_id,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        published,
        questions: form.questions.map((x) => ({
          type: x.type,
          prompt: x.prompt,
          points: Number(x.points) || 0,
          explanation: x.explanation,
          options: x.type === 'mcq' ? x.options.map((o) => o.trim()).filter(Boolean) : [],
          accepted: x.type === 'mcq' ? [String(x.correct)]
            : x.type === 'short' ? x.acceptedText.split('\n').map((s) => s.trim()).filter(Boolean) : [],
        })),
      };
      // phương án trắc nghiệm trống bị lọc → kiểm tra phương án đúng vẫn còn
      form.questions.forEach((x, i) => {
        if (x.type === 'mcq' && !(x.options[x.correct] || '').trim()) {
          throw new Error(`Câu ${i + 1}: phương án đúng đang để trống.`);
        }
        if (x.type === 'mcq') {
          const kept = x.options.slice(0, x.correct).filter((o) => o.trim()).length;
          payload.questions[i].accepted = [String(kept)];
        }
      });
      await rpc('save_assignment', { p: payload });
      go('/');
    } catch (e) {
      setSaveErr(e.message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Xoá bài tập này? Bài làm của em (nếu có) cũng bị xoá.')) return;
    try {
      await q(sb.from('assignments').delete().eq('id', id));
      go('/');
    } catch (e) { setSaveErr(e.message); }
  }

  return html`
    <${Back} />
    <div class="page-head">
      <h1>${id ? 'Sửa bài tập' : copyFrom ? 'Nhân bản bài tập' : 'Giao bài mới'}</h1>
      ${id && html`<div class="row">
        <button class="btn" onClick=${() => go('/nhan-ban/' + id)}>Nhân bản</button>
        <button class="btn danger-outline" onClick=${remove}>Xoá</button>
      </div>`}
    </div>

    ${locked && html`<div class="alert warn">
      Em đã mở bài này nên không sửa được câu hỏi nữa.${' '}
      <a href=${'#/cham/' + data.subs[0].id}>Xem bài làm</a> hoặc bấm <b>Nhân bản</b> để tạo bài mới từ bài này.
    </div>`}

    <fieldset disabled=${locked}>
      <div class="card">
        <label>Tên bài
          <input value=${form.title} onInput=${(e) => set({ title: e.target.value })} placeholder="VD: Ôn tập phép nhân bảng 7" />
        </label>
        <div class="grid2">
          <label>Môn
            <select value=${form.subject} onChange=${(e) => set({ subject: e.target.value })}>
              ${[...new Set([...SUBJECTS, form.subject])].map((s) => html`<option value=${s}>${s}</option>`)}
            </select>
          </label>
          <label>Giao cho
            <select value=${form.student_id} onChange=${(e) => set({ student_id: e.target.value })}>
              ${data.students.map((s) => html`<option value=${s.id}>${s.full_name}</option>`)}
            </select>
          </label>
        </div>
        <label>Hạn nộp (không bắt buộc)
          <input type="datetime-local" value=${form.due_at} onInput=${(e) => set({ due_at: e.target.value })} />
        </label>
        <label>Lời dặn cho em (không bắt buộc)
          <textarea rows="2" value=${form.instructions} onInput=${(e) => set({ instructions: e.target.value })}
                    placeholder="VD: Làm cẩn thận, chụp ảnh rõ nét nhé!"></textarea>
        </label>
      </div>

      <h2 class="section-title">Câu hỏi <small class="muted">(${form.questions.length} câu · ${fmtNum(totalPoints)} điểm)</small></h2>

      ${form.questions.map((x, i) => html`
        <${QuestionEditor} key=${x.uid} q=${x} index=${i} total=${form.questions.length}
          onChange=${(patch) => setQ(i, patch)} onMove=${(d) => moveQ(i, d)} onRemove=${() => removeQ(i)} />`)}

      <div class="add-bar">
        ${Object.entries(TYPE_LABEL).map(([t, label]) => html`
          <button class="btn" onClick=${() => addQ([blankQuestion(t)])}>+ ${label}</button>`)}
      </div>

      <${AIGenerator} subject=${form.subject} onAdd=${(items) => addQ(items.map(fromGenerated))} />
      <${MathGenerator} onAdd=${(items) => addQ(items.map(fromGenerated))} />
    </fieldset>

    <${ErrorBox} msg=${saveErr} />
    ${!locked && html`
      <div class="save-bar">
        <button class="btn" disabled=${saving} onClick=${() => save(false)}>Lưu nháp</button>
        <button class="btn primary" disabled=${saving} onClick=${() => save(true)}>
          ${saving ? 'Đang lưu…' : form.published ? 'Lưu thay đổi' : 'Giao bài cho em'}
        </button>
      </div>`}`;
}

function QuestionEditor({ q: x, index, total, onChange, onMove, onRemove }) {
  const setOpt = (i, v) => onChange({ options: x.options.map((o, j) => (j === i ? v : o)) });
  return html`
    <div class="card qcard">
      <div class="qhead">
        <b>Câu ${index + 1}</b>
        <select value=${x.type} onChange=${(e) => onChange({ ...blankQuestion(e.target.value), uid: x.uid, prompt: x.prompt, points: x.points, explanation: x.explanation })}>
          ${Object.entries(TYPE_LABEL).map(([t, l]) => html`<option value=${t}>${l}</option>`)}
        </select>
        <label class="inline">Điểm
          <input type="number" min="0" step="0.25" class="num" value=${x.points} onInput=${(e) => onChange({ points: e.target.value })} />
        </label>
        <span class="spacer"></span>
        <button class="icon" title="Lên" disabled=${index === 0} onClick=${() => onMove(-1)}>↑</button>
        <button class="icon" title="Xuống" disabled=${index === total - 1} onClick=${() => onMove(1)}>↓</button>
        <button class="icon danger" title="Xoá câu" disabled=${total === 1} onClick=${onRemove}>✕</button>
      </div>

      <textarea rows="2" placeholder="Nội dung câu hỏi" value=${x.prompt} onInput=${(e) => onChange({ prompt: e.target.value })}></textarea>

      ${x.type === 'mcq' && html`
        <div class="opts">
          <div class="small muted">Chọn ● vào phương án đúng:</div>
          ${x.options.map((o, i) => html`
            <div class="opt-row">
              <input type="radio" name=${'c' + x.uid} checked=${x.correct === i} onChange=${() => onChange({ correct: i })} />
              <span class="opt-letter">${String.fromCharCode(65 + i)}</span>
              <input value=${o} onInput=${(e) => setOpt(i, e.target.value)} placeholder=${'Phương án ' + String.fromCharCode(65 + i)} />
              <button class="icon" disabled=${x.options.length <= 2}
                onClick=${() => onChange({ options: x.options.filter((_, j) => j !== i), correct: x.correct === i ? 0 : x.correct > i ? x.correct - 1 : x.correct })}>✕</button>
            </div>`)}
          ${x.options.length < 8 && html`<button class="link small" onClick=${() => onChange({ options: [...x.options, ''] })}>+ Thêm phương án</button>`}
        </div>`}

      ${x.type === 'short' && html`
        <label>Đáp án đúng <span class="muted small">(mỗi dòng một cách viết được chấp nhận; số 2,5 = 2.5 tự hiểu)</span>
          <textarea rows="2" value=${x.acceptedText} onInput=${(e) => onChange({ acceptedText: e.target.value })} placeholder="VD: 42"></textarea>
        </label>`}

      ${(x.type === 'essay' || x.type === 'photo') && html`
        <div class="small muted">${x.type === 'photo'
          ? 'Em sẽ chụp ảnh bài làm trong vở để nộp. Bạn chấm tay khi em nộp.'
          : 'Em gõ câu trả lời. Bạn chấm tay khi em nộp.'}</div>`}

      <label>${x.type === 'essay' || x.type === 'photo' ? 'Đáp án mẫu / gợi ý chấm' : 'Giải thích'}
        <span class="muted small"> (em chỉ thấy sau khi bài được chấm)</span>
        <textarea rows="2" value=${x.explanation} onInput=${(e) => onChange({ explanation: e.target.value })}></textarea>
      </label>
    </div>`;
}

// ✨ AI soạn đề (Gemini). Trang Tiến độ có thể gửi sẵn chủ đề qua sessionStorage('ai-topic').
const AI_TYPES = { mcq: 'Trắc nghiệm', short: 'Điền đáp án', essay: 'Tự luận' };

function AIGenerator({ subject, onAdd }) {
  const [preset] = useState(() => {
    const p = sessionStorage.getItem('ai-topic') || '';
    sessionStorage.removeItem('ai-topic');
    return p;
  });
  const [topic, setTopic] = useState(preset);
  const [grade, setGrade] = useState(localStorage.getItem('ai-grade') || '3');
  const [count, setCount] = useState(5);
  const [level, setLevel] = useState('vừa');
  const [types, setTypes] = useState(['mcq', 'short']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const toggle = (t) => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));

  async function run() {
    setBusy(true); setErr(''); setMsg('');
    localStorage.setItem('ai-grade', grade);
    try {
      const { questions } = await ai({ action: 'generate', topic, subject, grade, level, count: Number(count), types });
      onAdd(questions);
      setMsg(`✔ Đã thêm ${questions.length} câu ở trên. Hãy đọc lại và sửa nếu cần trước khi giao.`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return html`
    <details class="card gen ai" open=${!!preset}>
      <summary>✨ AI soạn đề (Gemini)</summary>
      <label>Chủ đề / nội dung cần ôn
        <textarea rows="3" value=${topic} onInput=${(e) => setTopic(e.target.value)}
          placeholder="VD: Bảng nhân 7 và bài toán có lời văn về nhân. Hoặc dán nội dung bài học vào đây."></textarea>
      </label>
      <div class="grid4">
        <label>Lớp
          <select value=${grade} onChange=${(e) => setGrade(e.target.value)}>
            ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((g) => html`<option value=${g}>Lớp ${g}</option>`)}
          </select>
        </label>
        <label>Độ khó
          <select value=${level} onChange=${(e) => setLevel(e.target.value)}>
            ${['dễ', 'vừa', 'khó'].map((l) => html`<option value=${l}>${l}</option>`)}
          </select>
        </label>
        <label>Số câu <input type="number" min="1" max="20" value=${count} onInput=${(e) => setCount(e.target.value)} /></label>
        <label>Môn <input value=${subject} disabled /></label>
      </div>
      <div class="chips">
        ${Object.entries(AI_TYPES).map(([t, l]) => html`
          <label class=${'chip ' + (types.includes(t) ? 'on' : '')}>
            <input type="checkbox" checked=${types.includes(t)} onChange=${() => toggle(t)} /> ${l}
          </label>`)}
      </div>
      <${ErrorBox} msg=${err} />
      ${msg && html`<div class="alert ok">${msg}</div>`}
      <button class="btn primary" disabled=${busy || !topic.trim() || !types.length} onClick=${run}>
        ${busy ? 'AI đang soạn… (khoảng 10–30 giây)' : `✨ Soạn ${count} câu`}
      </button>
      <p class="small muted">AI có thể sai. Luôn đọc lại đề và đáp án trước khi giao cho em.</p>
    </details>`;
}

function MathGenerator({ onAdd }) {
  const [ops, setOps] = useState(['+']);
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(20);
  const [count, setCount] = useState(10);
  const [points, setPoints] = useState(1);
  const [err, setErr] = useState('');
  const toggle = (op) => setOps((o) => (o.includes(op) ? o.filter((x) => x !== op) : [...o, op]));
  function add() {
    setErr('');
    try { onAdd(generateMath({ ops, min: Number(min), max: Number(max), count: Number(count), points: Number(points) || 1 })); }
    catch (e) { setErr(e.message); }
  }
  return html`
    <details class="card gen">
      <summary>🧮 Tạo nhanh đề toán (không cần tự gõ)</summary>
      <div class="chips">
        ${Object.entries(OPS).map(([op, label]) => html`
          <label class=${'chip ' + (ops.includes(op) ? 'on' : '')}>
            <input type="checkbox" checked=${ops.includes(op)} onChange=${() => toggle(op)} /> ${op} ${label}
          </label>`)}
      </div>
      <div class="grid4">
        <label>Số từ <input type="number" min="0" value=${min} onInput=${(e) => setMin(e.target.value)} /></label>
        <label>đến <input type="number" min="0" value=${max} onInput=${(e) => setMax(e.target.value)} /></label>
        <label>Số câu <input type="number" min="1" max="100" value=${count} onInput=${(e) => setCount(e.target.value)} /></label>
        <label>Điểm/câu <input type="number" min="0" step="0.25" value=${points} onInput=${(e) => setPoints(e.target.value)} /></label>
      </div>
      <${ErrorBox} msg=${err} />
      <button class="btn" onClick=${add}>Thêm ${count} câu vào bài</button>
    </details>`;
}

// =====================================================================
//  CHẤM BÀI
// =====================================================================
export function GradeSubmission({ id }) {
  const [grades, setGrades] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [aiInfo, setAiInfo] = useState({}); // question_id → độ tin cậy AI
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [aiErr, setAiErr] = useState('');

  const [data, err, reload] = useLoad(async () => {
    const s = await q(sb.from('submissions').select('*, assignments(id, title, subject, instructions, due_at)').eq('id', id).single());
    const [qs, ans, student] = await Promise.all([
      q(sb.from('questions').select('*, question_keys(accepted, explanation)').eq('assignment_id', s.assignment_id).order('position')),
      q(sb.from('answers').select('*').eq('submission_id', id)),
      q(sb.from('profiles').select('full_name').eq('id', s.student_id).single()),
    ]);
    const urls = await signedUrls(ans.flatMap((a) => a.image_paths));
    const byQ = Object.fromEntries(ans.map((a) => [a.question_id, a]));
    const g = {};
    for (const x of qs) {
      const a = byQ[x.id];
      g[x.id] = { points: a && a.points_awarded != null ? String(Number(a.points_awarded)) : '', feedback: (a && a.feedback) || '' };
    }
    setGrades(g);
    setComment(s.teacher_comment || '');
    return { s, qs, byQ, urls, student };
  }, [id]);

  if (err) return html`<${Back} /><${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;

  const { s, qs, byQ, urls, student } = data;
  const a = s.assignments;
  const max = qs.reduce((t, x) => t + Number(x.points), 0);
  const total = qs.reduce((t, x) => t + (Number(grades[x.id] && grades[x.id].points) || 0), 0);
  const missing = qs.filter((x) => !grades[x.id] || grades[x.id].points === '').length;
  const setG = (qid, patch) => setGrades((g) => ({ ...g, [qid]: { ...g[qid], ...patch } }));

  async function aiGrade() {
    setAiBusy(true); setAiErr(''); setAiMsg('');
    try {
      const res = await ai({ action: 'grade', submission_id: id });
      if (!res.grades.length) {
        setAiMsg('Không có câu tự luận / ảnh nào cần AI chấm.');
      } else {
        setGrades((g) => {
          const next = { ...g };
          for (const r of res.grades) next[r.question_id] = { points: String(r.points), feedback: r.feedback };
          return next;
        });
        setAiInfo(Object.fromEntries(res.grades.map((r) => [r.question_id, r.confidence])));
        if (res.overall_comment) setComment((c) => c.trim() ? c : res.overall_comment);
        const low = res.grades.filter((r) => r.confidence === 'thấp').length;
        setAiMsg(`✨ AI đã điền gợi ý cho ${res.grades.length} câu${low ? `, trong đó ${low} câu AI không chắc chắn (đánh dấu ⚠)` : ''}. Hãy xem lại rồi mới bấm "Trả bài".`);
      }
    } catch (e) { setAiErr(e.message); }
    setAiBusy(false);
  }

  async function submit() {
    setBusy(true); setSaveErr(''); setMsg('');
    try {
      await rpc('return_submission', {
        p_submission: id,
        p_grades: qs.map((x) => ({ question_id: x.id, points: grades[x.id].points, feedback: grades[x.id].feedback })),
        p_comment: comment,
      });
      setMsg('✔ Đã trả bài cho em.');
      reload();
    } catch (e) { setSaveErr(e.message); }
    setBusy(false);
  }

  return html`
    <${Back} />
    <div class="page-head">
      <div>
        <h1>${a.title}</h1>
        <div class="muted small">${a.subject} · ${student.full_name}
          ${s.submitted_at && ` · nộp ${fmtDate(s.submitted_at)}`}
          ${a.due_at && s.submitted_at && new Date(s.submitted_at) > new Date(a.due_at) && html` · <span class="danger">nộp muộn</span>`}
        </div>
      </div>
      <a class="btn" href=${'#/bai/' + a.id}>Xem đề</a>
    </div>

    ${s.status === 'in_progress' && html`<div class="alert warn">Em đang làm, chưa nộp. Dưới đây là phần em đã làm tới giờ.</div>`}
    ${s.status === 'returned' && html`<div class="alert ok">Đã trả bài lúc ${fmtDate(s.returned_at)}. Bạn vẫn có thể sửa điểm rồi bấm "Cập nhật".</div>`}

    ${s.status !== 'in_progress' && qs.some((x) => x.type === 'essay' || x.type === 'photo' || x.type === 'short') && html`
      <div class="card ai-bar">
        <button class="btn primary" disabled=${aiBusy} onClick=${aiGrade}>
          ${aiBusy ? 'AI đang chấm… (khoảng 10–40 giây)' : '✨ AI gợi ý chấm'}
        </button>
        <span class="small muted">AI đọc bài tự luận, ảnh chụp và câu điền bị máy chấm sai, rồi điền sẵn điểm + nhận xét để bạn duyệt.</span>
        <${ErrorBox} msg=${aiErr} />
        ${aiMsg && html`<div class="alert ok">${aiMsg}</div>`}
      </div>`}

    ${qs.map((x, i) => {
      const ans = byQ[x.id];
      const k = keyOf(x);
      const g = grades[x.id] || { points: '', feedback: '' };
      const manual = x.type === 'essay' || x.type === 'photo';
      return html`
        <div class=${'card qcard ' + (ans && ans.is_correct === true ? 'right' : ans && ans.is_correct === false ? 'wrong' : '')}>
          <div class="qhead">
            <b>Câu ${i + 1}</b><span class="tag gray">${TYPE_LABEL[x.type]}</span>
            <span class="spacer"></span><span class="muted small">${fmtNum(x.points)} điểm</span>
          </div>
          <div class="prompt">${nl2br(x.prompt)}</div>
          <${AnswerView} q=${x} ans=${ans} k=${k} urls=${urls} showKey />
          <div class="grade-row">
            <label class="inline">Điểm
              <input type="number" class="num" min="0" max=${x.points} step="0.25" value=${g.points}
                     disabled=${s.status === 'in_progress'} onInput=${(e) => setG(x.id, { points: e.target.value })} />
              / ${fmtNum(x.points)}
            </label>
            ${s.status !== 'in_progress' && html`
              <button class="btn small" onClick=${() => setG(x.id, { points: String(Number(x.points)) })}>Đúng</button>
              <button class="btn small" onClick=${() => setG(x.id, { points: '0' })}>Sai</button>`}
            ${!manual && ans && ans.is_correct != null && html`<span class="muted small">(máy chấm: ${ans.is_correct ? 'đúng' : 'sai'})</span>`}
            ${aiInfo[x.id] && html`<span class=${'tag ' + (aiInfo[x.id] === 'thấp' ? 'orange' : 'blue')}>
              ${aiInfo[x.id] === 'thấp' ? '⚠ AI không chắc' : '✨ AI gợi ý'}</span>`}
          </div>
          <input class="feedback" placeholder="Nhận xét cho câu này (không bắt buộc)" value=${g.feedback}
                 disabled=${s.status === 'in_progress'} onInput=${(e) => setG(x.id, { feedback: e.target.value })} />
        </div>`;
    })}

    ${s.status !== 'in_progress' && html`
      <div class="card">
        <label>Lời nhận xét chung
          <textarea rows="3" value=${comment} onInput=${(e) => setComment(e.target.value)} placeholder="VD: Em làm tốt lắm, nhớ cẩn thận phần đặt tính nhé!"></textarea>
        </label>
        <div class="total">Tổng: <b>${fmtNum(total)} / ${fmtNum(max)}</b>
          ${max > 0 && html` = <b>${fmtNum(scoreOn10(total, max))}/10</b>`}
          ${missing > 0 && html` · <span class="warn">còn ${missing} câu chưa cho điểm</span>`}
        </div>
        <${ErrorBox} msg=${saveErr} />
        ${msg && html`<div class="alert ok">${msg}</div>`}
        <button class="btn primary full" disabled=${busy || missing > 0} onClick=${submit}>
          ${busy ? 'Đang lưu…' : s.status === 'returned' ? 'Cập nhật điểm' : 'Trả bài cho em'}
        </button>
      </div>`}`;
}

// Hiển thị câu trả lời của em (dùng chung cho trang chấm và trang kết quả của em)
export function AnswerView({ q: x, ans, k, urls, showKey }) {
  const text = ans ? ans.answer_text : '';
  const imgs = ans ? ans.image_paths : [];
  if (x.type === 'mcq') {
    const correct = k && k.accepted && k.accepted.length ? Number(k.accepted[0]) : null;
    return html`<ul class="mcq-view">
      ${x.options.map((o, i) => {
        const chosen = text !== '' && Number(text) === i;
        const isRight = showKey && correct === i;
        return html`<li class=${(chosen ? 'chosen ' : '') + (isRight ? 'is-right' : '')}>
          <span class="opt-letter">${String.fromCharCode(65 + i)}</span> ${o}
          ${chosen && html` <span class="small">← em chọn</span>`}
          ${isRight && html` <span class="small good-text">✔ đáp án</span>`}
        </li>`;
      })}
      ${text === '' && html`<li class="muted">(em bỏ trống)</li>`}
    </ul>`;
  }
  return html`
    <div class="answer">
      ${x.type !== 'photo' || text ? html`<div class="answer-text">${text ? nl2br(text) : html`<span class="muted">(em bỏ trống)</span>`}</div>` : ''}
      ${x.type === 'photo' && html`
        <div class="thumbs">
          ${imgs.length === 0 && html`<span class="muted">(chưa có ảnh)</span>`}
          ${imgs.map((p) => urls[p] && html`<a href=${urls[p]} target="_blank" rel="noopener"><img src=${urls[p]} alt="Ảnh bài làm" /></a>`)}
        </div>`}
      ${showKey && x.type === 'short' && k && html`<div class="key small">Đáp án: <b>${k.accepted.join(' / ')}</b></div>`}
      ${showKey && k && k.explanation && html`<div class="key small">${x.type === 'essay' || x.type === 'photo' ? 'Đáp án mẫu: ' : 'Giải thích: '}${nl2br(k.explanation)}</div>`}
    </div>`;
}

// =====================================================================
//  TIẾN ĐỘ HỌC TẬP
// =====================================================================

// Gửi danh sách câu sai sang trình soạn bài, mở sẵn khung "AI soạn đề"
function practiceFromWrong(wrong) {
  const lines = wrong.slice(0, 12).map((w) => `- [${w.submissions.assignments.subject}] ${w.questions.prompt}`);
  sessionStorage.setItem('ai-topic',
    `Soạn bài luyện tập giúp em khắc phục các dạng bài em đã làm sai gần đây (không chép lại y nguyên, đổi số/đổi ngữ cảnh, từ dễ đến khó):\n${lines.join('\n')}`);
  go('/bai/moi');
}
export function Progress({ profile }) {
  const [studentId, setStudentId] = useState('');
  const [students, sErr] = useLoad(() => q(sb.from('profiles').select('id, full_name').eq('teacher_id', profile.id).order('created_at')));
  const sid = studentId || (students && students[0] && students[0].id) || '';

  const [data, err] = useLoad(async () => {
    if (!sid) return null;
    const [assignments, wrong] = await Promise.all([
      q(sb.from('assignments')
        .select('id, title, subject, due_at, published, submissions(id, status, score, max_score, submitted_at, returned_at)')
        .eq('student_id', sid).eq('published', true)),
      q(sb.from('answers')
        .select('answer_text, submission_id, questions(prompt, type, options), submissions!inner(student_id, status, returned_at, assignments(title, subject))')
        .eq('submissions.student_id', sid).eq('submissions.status', 'returned').eq('is_correct', false)
        .limit(200)),
    ]);
    return { assignments, wrong };
  }, [sid]);

  const stats = useMemo(() => {
    if (!data) return null;
    const done = [], open = [];
    for (const a of data.assignments) {
      const s = a.submissions[0];
      if (s && s.status === 'returned') done.push({ ...a, s });
      else if (!s || s.status === 'in_progress') open.push(a);
    }
    done.sort((x, y) => new Date(y.s.returned_at) - new Date(x.s.returned_at));
    const bySubject = {};
    for (const d of done) {
      const v = scoreOn10(d.s.score, d.s.max_score);
      if (v == null) continue;
      (bySubject[d.subject] = bySubject[d.subject] || []).push(v);
    }
    const subjects = Object.entries(bySubject)
      .map(([name, arr]) => ({ name, n: arr.length, avg: arr.reduce((a, b) => a + b, 0) / arr.length }))
      .sort((a, b) => a.avg - b.avg);
    const all = done.map((d) => scoreOn10(d.s.score, d.s.max_score)).filter((v) => v != null);
    const overdue = open.filter((a) => a.due_at && new Date(a.due_at) < new Date()).length;
    const wrong = data.wrong.filter((w) => w.questions && w.submissions && w.submissions.assignments).sort((a, b) => new Date(b.submissions.returned_at) - new Date(a.submissions.returned_at)).slice(0, 20);
    return { done, open, overdue, subjects, wrong, avg: all.length ? all.reduce((a, b) => a + b, 0) / all.length : null };
  }, [data]);

  if (sErr) return html`<${ErrorBox} msg=${sErr} />`;
  if (!students) return html`<${Loading} />`;
  if (!students.length) return html`<div class="card center muted">Chưa có học sinh. Hãy gửi mã mời ở trang Bài tập.</div>`;

  return html`
    <div class="page-head">
      <h1>Tiến độ học tập</h1>
      ${students.length > 1 && html`
        <select value=${sid} onChange=${(e) => setStudentId(e.target.value)}>
          ${students.map((s) => html`<option value=${s.id}>${s.full_name}</option>`)}
        </select>`}
    </div>
    ${err && html`<${ErrorBox} msg=${err} />`}
    ${!stats ? html`<${Loading} />` : html`
      <div class="tiles">
        <div class="tile"><div class="tile-num">${stats.done.length}</div><div class="tile-label">bài đã chấm</div></div>
        <div class="tile"><div class="tile-num">${stats.avg == null ? '–' : fmtNum(Math.round(stats.avg * 10) / 10)}</div><div class="tile-label">điểm TB (/10)</div></div>
        <div class="tile"><div class="tile-num">${stats.open.length}</div><div class="tile-label">bài chưa nộp</div></div>
        <div class=${'tile ' + (stats.overdue ? 'tile-bad' : '')}><div class="tile-num">${stats.overdue}</div><div class="tile-label">bài quá hạn</div></div>
      </div>

      <div class="card">
        <h2>Điểm trung bình theo môn</h2>
        ${stats.subjects.length === 0 && html`<p class="muted">Chưa có bài nào được chấm.</p>`}
        ${stats.subjects.map((s) => html`
          <div class="bar-row">
            <div class="bar-label">${s.name} <span class="muted small">(${s.n} bài)</span></div>
            <div class="bar-track"><div class=${'bar-fill ' + (s.avg >= 8 ? 'good' : s.avg >= 5 ? 'mid' : 'bad')} style=${`width:${s.avg * 10}%`}></div></div>
            <div class="bar-val">${fmtNum(Math.round(s.avg * 10) / 10)}</div>
          </div>`)}
      </div>

      <div class="card">
        <h2>Câu em làm sai gần đây</h2>
        <p class="small muted">Dùng danh sách này để chọn chủ đề cho bài luyện tiếp theo.</p>
        ${stats.wrong.length === 0 && html`<p class="muted">Không có câu sai nào. 🎉</p>`}
        ${stats.wrong.length > 0 && html`
          <button class="btn primary" onClick=${() => practiceFromWrong(stats.wrong)}>✨ AI soạn bài luyện từ các câu sai này</button>`}
        <ul class="wrong-list">
          ${stats.wrong.map((w) => html`
            <li>
              <a href=${'#/cham/' + w.submission_id}>${w.questions.prompt}</a>
              <div class="small muted">${w.submissions.assignments.subject} · ${w.submissions.assignments.title}
                ${w.questions.type !== 'photo' && w.answer_text !== '' && html` · em trả lời: <b>${w.questions.type === 'mcq'
                  ? (w.questions.options[Number(w.answer_text)] || w.answer_text) : w.answer_text}</b>`}
              </div>
            </li>`)}
        </ul>
      </div>

      <div class="card">
        <h2>Kết quả gần đây</h2>
        ${stats.done.length === 0 && html`<p class="muted">Chưa có.</p>`}
        <div class="list">
          ${stats.done.slice(0, 15).map((d) => html`
            <a class="item" href=${'#/cham/' + d.s.id}>
              <div class="item-main"><div class="item-title">${d.title}</div>
                <div class="small muted">${d.subject} · trả bài ${fmtDate(d.s.returned_at, false)}</div></div>
              <div class="item-side"><${ScoreBadge} score=${d.s.score} max=${d.s.max_score} /></div>
            </a>`)}
        </div>
      </div>`}`;
}
