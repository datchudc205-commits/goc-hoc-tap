import { html, useState, useEffect } from './lib.js';

// ---------- Định tuyến bằng dấu # (chạy được trên mọi hosting tĩnh) ----------
export function useRoute() {
  const get = () => location.hash.replace(/^#/, '') || '/';
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

export const SUBJECTS = ['Toán', 'Tiếng Việt', 'Tiếng Anh', 'Khoa học', 'Lịch sử & Địa lý', 'Tin học', 'Khác'];

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
