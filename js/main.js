import { html, render, useState, useEffect } from './lib.js';
import { sb, configured, q } from './db.js';
import { useRoute, match, Loading, ErrorBox } from './ui.js';
import { AuthScreen } from './auth.js';
import { TeacherHome, AssignmentEditor, GradeSubmission, Progress } from './teacher.js';
import { StudentHome, DoAssignment, ResultView } from './student.js';

function SetupNeeded() {
  return html`
    <main class="wrap">
      <div class="card">
        <h1>Chưa kết nối cơ sở dữ liệu</h1>
        <p>Mở file <code>js/config.js</code> và điền <b>SUPABASE_URL</b> cùng <b>SUPABASE_ANON_KEY</b>
           theo hướng dẫn trong <code>HUONG-DAN.md</code>.</p>
      </div>
    </main>`;
}

function Header({ profile }) {
  const isTeacher = profile.role === 'teacher';
  return html`
    <header class="topbar">
      <a class="brand" href="#/">📘 Góc Học Tập</a>
      <nav>
        <a href="#/">${isTeacher ? 'Bài tập' : 'Bài của em'}</a>
        ${isTeacher && html`<a href="#/tien-do">Tiến độ</a>`}
      </nav>
      <div class="me">
        <span class="muted small">${profile.full_name}</span>
        <button class="link small" onClick=${() => sb.auth.signOut()}>Đăng xuất</button>
      </div>
    </header>`;
}

function TeacherRoutes({ path, profile }) {
  let m;
  if (path === '/') return html`<${TeacherHome} profile=${profile} />`;
  if (path === '/bai/moi') return html`<${AssignmentEditor} profile=${profile} />`;
  if ((m = match('/bai/:id', path))) return html`<${AssignmentEditor} key=${m.id} profile=${profile} id=${m.id} />`;
  if ((m = match('/nhan-ban/:id', path))) return html`<${AssignmentEditor} key=${'c' + m.id} profile=${profile} copyFrom=${m.id} />`;
  if ((m = match('/cham/:id', path))) return html`<${GradeSubmission} key=${m.id} id=${m.id} />`;
  if (path === '/tien-do') return html`<${Progress} profile=${profile} />`;
  return html`<${NotFound} />`;
}

function StudentRoutes({ path, profile }) {
  let m;
  if (path === '/') return html`<${StudentHome} profile=${profile} />`;
  if ((m = match('/lam/:id', path))) return html`<${DoAssignment} key=${m.id} profile=${profile} assignmentId=${m.id} />`;
  if ((m = match('/ket-qua/:id', path))) return html`<${ResultView} key=${m.id} id=${m.id} />`;
  return html`<${NotFound} />`;
}

const NotFound = () => html`<div class="card center">Không tìm thấy trang. <a href="#/">Về trang chính</a></div>`;

function App() {
  const path = useRoute();
  const [session, setSession] = useState(undefined); // undefined = đang kiểm tra
  const [profile, setProfile] = useState(undefined);
  const [err, setErr] = useState('');

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session && session.user.id;
  useEffect(() => {
    setErr('');
    if (!uid) { setProfile(undefined); return; }
    setProfile(undefined);
    q(sb.from('profiles').select('*').eq('id', uid).maybeSingle())
      .then((p) => p ? setProfile(p) : setErr('Không tìm thấy hồ sơ của tài khoản này.'))
      .catch((e) => setErr(e.message));
  }, [uid]);

  if (session === undefined) return html`<${Loading} />`;
  if (!session) return html`<${AuthScreen} />`;
  if (err) return html`<main class="wrap"><${ErrorBox} msg=${err} />
    <button class="btn" onClick=${() => sb.auth.signOut()}>Đăng xuất</button></main>`;
  if (!profile) return html`<${Loading} />`;

  return html`
    <${Header} profile=${profile} />
    <main class="wrap">
      ${profile.role === 'teacher'
        ? html`<${TeacherRoutes} path=${path} profile=${profile} />`
        : html`<${StudentRoutes} path=${path} profile=${profile} />`}
    </main>`;
}

render(configured ? html`<${App} />` : html`<${SetupNeeded} />`, document.getElementById('app'));
