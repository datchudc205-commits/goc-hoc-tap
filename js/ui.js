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
// Khung xương (skeleton) thay cho chữ "Đang tải…"
export const Loading = ({ rows = 3 }) => html`
  <div class="skeleton-page" aria-busy="true" aria-label="Đang tải">
    <div class="sk sk-title"></div>
    <div class="sk sk-sub"></div>
    ${Array.from({ length: rows }, () => html`<div class="sk sk-card"></div>`)}
  </div>`;

// ---------- Thông báo nổi (toast) ----------
let toastListeners = [];
let toastSeq = 0;
export function toast(message, type = 'ok') {
  const t = { id: ++toastSeq, message, type };
  toastListeners.forEach((f) => f(t));
}
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const f = (t) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3800);
    };
    toastListeners.push(f);
    return () => { toastListeners = toastListeners.filter((g) => g !== f); };
  }, []);
  return html`<div class="toaster" role="status" aria-live="polite">
    ${items.map((t) => html`<div class=${'toast ' + t.type} key=${t.id}>
      <${Icon} name=${t.type === 'error' ? 'alert' : 'check'} /><span>${t.message}</span></div>`)}
  </div>`;
}

// ---------- Hộp xác nhận (thay cho confirm() của trình duyệt) ----------
let dialogOpen = null;
export function confirmDialog({ title = 'Xác nhận', message = '', confirmText = 'Đồng ý', cancelText = 'Huỷ', danger = false }) {
  return new Promise((resolve) => dialogOpen && dialogOpen({ title, message, confirmText, cancelText, danger, resolve }));
}
export function DialogHost() {
  const [d, setD] = useState(null);
  useEffect(() => { dialogOpen = setD; return () => { dialogOpen = null; }; }, []);
  if (!d) return null;
  const close = (v) => { d.resolve(v); setD(null); };
  return html`
    <${Modal} title=${d.title} onClose=${() => close(false)}
      footer=${html`<button class="btn" onClick=${() => close(false)}>${d.cancelText}</button>
        <button class=${'btn ' + (d.danger ? 'danger' : 'primary')} onClick=${() => close(true)} autofocus>${d.confirmText}</button>`}>
      <div class="confirm-body">
        ${d.danger && html`<span class="confirm-ico"><${Icon} name="alert" size=${22} /></span>`}
        <p>${nl2br(d.message)}</p>
      </div>
    </${Modal}>`;
}

// ---------- Trạng thái trống ----------
export const EmptyState = ({ icon = 'book', title, text, action }) => html`
  <div class="empty">
    <div class="empty-ico"><${Icon} name=${icon} size=${26} /></div>
    <h3>${title}</h3>
    ${text && html`<p class="muted">${text}</p>`}
    ${action && html`<div class="empty-action">${action}</div>`}
  </div>`;

// ---------- Màu theo môn học ----------
const SUBJECT_TONES = {
  'Toán': 'blue', 'Ngữ văn': 'rose', 'Tiếng Việt': 'rose', 'Tiếng Anh': 'violet', 'Khoa học tự nhiên': 'green',
  'Lịch sử và Địa lí': 'amber', 'Giáo dục công dân': 'teal', 'Tin học': 'indigo', 'Công nghệ': 'orange',
};
export const subjectTone = (s) => SUBJECT_TONES[s] || 'slate';
const SUBJECT_SHORT = { 'Khoa học tự nhiên': 'KHTN', 'Lịch sử và Địa lí': 'LS & ĐL', 'Giáo dục công dân': 'GDCD',
  'Hoạt động trải nghiệm, hướng nghiệp': 'HĐTN' };
export const SubjectChip = ({ subject, short }) => html`
  <span class=${'subject-chip tone-' + subjectTone(subject)}><i></i>${short ? SUBJECT_SHORT[subject] || subject : subject}</span>`;
export const SubjectIcon = ({ subject }) => html`
  <span class=${'subject-icon tone-' + subjectTone(subject)}>${(SUBJECT_SHORT[subject] || subject || '?').slice(0, 2)}</span>`;

// ---------- Vòng tiến độ ----------
export function ProgressRing({ value = 0, size = 88, stroke = 9, label, sub }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return html`
    <div class="ring" style=${`width:${size}px;height:${size}px`}>
      <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx=${size / 2} cy=${size / 2} r=${r} class="ring-track" stroke-width=${stroke} fill="none" />
        <circle cx=${size / 2} cy=${size / 2} r=${r} class="ring-bar" stroke-width=${stroke} fill="none"
          stroke-dasharray=${c} stroke-dashoffset=${c * (1 - v)} transform=${`rotate(-90 ${size / 2} ${size / 2})`} stroke-linecap="round" />
      </svg>
      <div class="ring-label"><b>${label}</b>${sub && html`<small>${sub}</small>`}</div>
    </div>`;
}

export const Avatar = ({ name = '', size = '' }) => html`
  <span class=${'avatar ' + size} aria-hidden="true">${name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?'}</span>`;

// "5 phút trước", "2 ngày trước"
export function relTime(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} ngày trước`;
  return fmtDate(iso, false);
}

// "còn 2 ngày", "quá hạn 3 giờ"
export function countdown(iso) {
  if (!iso) return null;
  const ms = new Date(iso) - Date.now(), a = Math.abs(ms), late = ms < 0;
  const txt = a < 3600e3 ? `${Math.max(1, Math.round(a / 60e3))} phút` : a < 86400e3 ? `${Math.round(a / 3600e3)} giờ` : `${Math.round(a / 86400e3)} ngày`;
  return { late, soon: !late && ms < 86400e3, text: late ? `Quá hạn ${txt}` : `Còn ${txt}` };
}

// ---------- Giao diện sáng / tối ----------
export function applyTheme(mode = localStorage.getItem('theme') || 'system') {
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  return mode;
}
export function useTheme() {
  const [mode, setMode] = useState(localStorage.getItem('theme') || 'system');
  useEffect(() => {
    applyTheme(mode);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const f = () => applyTheme(mode);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [mode]);
  const cycle = () => {
    const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    localStorage.setItem('theme', next);
    setMode(next);
  };
  return [mode, cycle];
}

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
  alert: 'M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  panel: 'M3 4h18v16H3zM9 4v16',
  chevronRight: 'M9 18l6-6-6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  game: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.6 6A3 3 0 0 0 5.1 18c.9 0 1.6-.4 2-1.1L8.5 15h7l1.4 1.9a2.5 2.5 0 0 0 2 1.1 3 3 0 0 0 3-3.4l-.6-6A4 4 0 0 0 17.3 5z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
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

// Bỏ ký hiệu công thức kiểu LaTeX mà AI hay chèn: $x$ → x, \times → ×, \frac{a}{b} → a/b
export function plainMath(text) {
  return String(text || '')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/\\times/g, '×').replace(/\\cdot/g, '·').replace(/\\div/g, ':')
    .replace(/\\neq/g, '≠').replace(/\\leq?/g, '≤').replace(/\\geq?/g, '≥')
    .replace(/\$\$?([^$]+?)\$\$?/g, '$1')
    .replace(/\^\{?(\d{1,3})\}?/g, (_, d) => d.split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join(''));
}

export function nl2br(text) {
  return String(text || '').split('\n').map((line, i) => (i ? [html`<br />`, line] : line));
}
