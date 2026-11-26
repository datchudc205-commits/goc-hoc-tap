import { html, useState, useEffect } from './lib.js';
import { SUBJECTS_6, GRADE6, BOOK, findSubject } from './curriculum.js';

// ---------- Chọn bài theo SGK lớp 6 (Kết nối tri thức) ----------
// onPick({ subject, chapter, lesson }) – lesson có thể rỗng nếu chỉ chọn chương
export function LessonPicker({ subject, onPick, compact }) {
  const subj = findSubject(subject);
  const [chapterIdx, setChapterIdx] = useState('');
  const [lesson, setLesson] = useState('');
  useEffect(() => { setChapterIdx(''); setLesson(''); }, [subject]);
  const chapter = subj && chapterIdx !== '' ? subj.chapters[Number(chapterIdx)] : null;
  const pick = (ci, l) => {
    const ch = subj && ci !== '' ? subj.chapters[Number(ci)] : null;
    onPick({ subject: subj ? subj.subject : subject, chapter: ch ? ch.name : '', lesson: l });
  };
  return html`
    <div class=${'lesson-picker ' + (compact ? 'compact' : '')}>
      <label>Môn <span class="muted small">(SGK lớp 6)</span>
        <select value=${subj ? subj.subject : ''} onChange=${(e) => onPick({ subject: e.target.value, chapter: '', lesson: '' })}>
          <option value="">— Chọn môn —</option>
          ${GRADE6.map((s) => html`<option value=${s.subject}>${s.subject}</option>`)}
        </select>
      </label>
      ${subj && subj.chapters.length > 0 && html`
        <label>Chương / chủ đề
          <select value=${chapterIdx} onChange=${(e) => { setChapterIdx(e.target.value); setLesson(''); pick(e.target.value, ''); }}>
            <option value="">— Chọn chương —</option>
            ${subj.chapters.map((c, i) => html`<option value=${String(i)}>${c.name}</option>`)}
          </select>
        </label>`}
      ${chapter && html`
        <label>Bài học
          <select value=${lesson} onChange=${(e) => { setLesson(e.target.value); pick(chapterIdx, e.target.value); }}>
            <option value="">— Cả chương —</option>
            ${chapter.lessons.map((l) => html`<option value=${l}>${l}</option>`)}
          </select>
        </label>`}
    </div>`;
}

// ---------- Định tuyến bằng dấu # (chạy được trên mọi hosting tĩnh) ----------
export function useRoute() {
  // Link khôi phục mật khẩu của Supabase gắn "#access_token=…" vào URL → coi như trang chủ
  const get = () => {
    const h = location.hash.replace(/^#/, '');
    return !h || /access_token=|type=recovery|error_description=/.test(h) ? '/' : h;
  };
  const [path, setPath] = useState(get());
  useEffect(() => {
    const f = () => { setPath(get()); window.scrollTo(0, 0); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return path;
}

// match('/lam/:id', '/lam/123') → { id: '123' }
export function match(pattern, path) {
  const a = pattern.split('/'), b = path.split('?')[0].split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export const go = (p) => { location.hash = p; };

// ---------- Tải dữ liệu ----------
// const [data, err, reload] = useLoad(async () => ..., [deps])
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, err: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, err: '' }));
    fn().then(
      (data) => alive && setState({ data, err: '' }),
      (e) => alive && setState({ data: null, err: e.message || String(e) }),
    );
    return () => { alive = false; };
  }, [...deps, tick]);
  return [state.data, state.err, () => setTick((t) => t + 1)];
}

// ---------- Thành phần dùng chung ----------
export const Loading = ({ text = 'Đang tải…' }) => html`<div class="center muted pad">${text}</div>`;

export const ErrorBox = ({ msg }) => msg ? html`<div class="alert error">${msg}</div>` : null;

export const Back = ({ to = '/', label = 'Quay lại' }) =>
  html`<a class="back" href=${'#' + to}>← ${label}</a>`;

export const TYPE_LABEL = {
  mcq: 'Trắc nghiệm',
  short: 'Điền đáp án',
  essay: 'Tự luận',
  photo: 'Nộp ảnh bài làm',
};

export const SUBJECTS = [...SUBJECTS_6, 'Tiếng Việt', 'Khác'];

// ---------- Biểu tượng (SVG nét mảnh, kiểu Lucide) ----------
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  clipboard: 'M9 4h6v3H9zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 13l2 2 4-4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M17.94 17.94A10 10 0 0 1 12 20C5 20 1 12 1 12a18 18 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19M1 1l22 22M14.12 14.12a3 3 0 1 1-4.24-4.24',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
  key: 'M21 2l-2 2M15.5 7.5l3 3L22 7l-3-3M11.39 11.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM11.4 11.6 19 4',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.9-1',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  menu: 'M3 6h18M3 12h18M3 18h18',
};
export const Icon = ({ name, size = 18 }) => html`
  <svg class="ico" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d=${ICONS[name] || ''} />
  </svg>`;

// ---------- Hộp thoại ----------
export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, []);
  return html`
    <div class="modal-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${title}</h3>
          <button class="icon-btn" aria-label="Đóng" onClick=${onClose}><${Icon} name="x" /></button></div>
        <div class="modal-body">${children}</div>
        ${footer && html`<div class="modal-foot">${footer}</div>`}
      </div>
    </div>`;
}

// ---------- Ô mật khẩu có nút hiện/ẩn ----------
export function PasswordInput({ value, onInput, autocomplete = 'current-password', minlength, placeholder }) {
  const [show, setShow] = useState(false);
  return html`
    <div class="pw-wrap">
      <input type=${show ? 'text' : 'password'} value=${value} onInput=${onInput} autocomplete=${autocomplete}
             minlength=${minlength} placeholder=${placeholder} required autocapitalize="off" autocorrect="off" spellcheck="false" />
      <button type="button" class="pw-eye" onClick=${() => setShow((s) => !s)}
              title=${show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-label=${show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
        <${Icon} name=${show ? 'eyeOff' : 'eye'} />
      </button>
    </div>`;
}

// Mật khẩu dễ đọc cho trẻ: 2 từ + 3 số, không dấu
export function randomPassword() {
  const words = ['meo', 'cho', 'tho', 'gau', 'ca', 'chim', 'hoa', 'sao', 'trang', 'may', 'nui', 'song', 'bien', 'cay'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return pick() + pick() + (100 + Math.floor(Math.random() * 900));
}

// ---------- Định dạng ----------
export function fmtDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (!withTime) return date;
  return `${date} lúc ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

export function dueInfo(dueIso, done) {
  if (!dueIso) return null;
  const ms = new Date(dueIso) - Date.now();
  if (done) return { cls: 'muted', text: `Hạn: ${fmtDate(dueIso)}` };
  if (ms < 0) return { cls: 'danger', text: `Quá hạn từ ${fmtDate(dueIso)}` };
  if (ms < 24 * 3600e3) return { cls: 'warn', text: `Sắp hết hạn: ${fmtDate(dueIso)}` };
  return { cls: 'muted', text: `Hạn: ${fmtDate(dueIso)}` };
}

export const fmtNum = (n) => (n == null ? '–' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 }));

// Quy về thang 10 cho dễ hiểu
export function scoreOn10(score, max) {
  if (score == null || !max) return null;
  return Math.round((score / max) * 100) / 10;
}

export function ScoreBadge({ score, max }) {
  const s = scoreOn10(score, max);
  if (s == null) return null;
  const cls = s >= 8 ? 'good' : s >= 5 ? 'mid' : 'bad';
  return html`<span class=${'score ' + cls}>${fmtNum(s)}<small>/10</small></span>`;
}

// Trạng thái bài tập từ góc nhìn người giao bài
export function statusOf(a) {
  const s = a.submissions && a.submissions[0];
  if (!a.published) return { key: 'draft', label: 'Nháp', cls: 'tag gray' };
  if (!s) return { key: 'assigned', label: 'Đã giao – chưa làm', cls: 'tag blue' };
  if (s.status === 'in_progress') return { key: 'doing', label: 'Đang làm', cls: 'tag blue' };
  if (s.status === 'submitted') return { key: 'submitted', label: 'Chờ chấm', cls: 'tag orange' };
  return { key: 'returned', label: 'Đã trả bài', cls: 'tag green' };
}

export function nl2br(text) {
  return String(text || '').split('\n').map((line, i) => (i ? [html`<br />`, line] : line));
}
