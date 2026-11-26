import { html, render, useState, useEffect } from './lib.js';
import { sb, configured, q } from './db.js';
import { USERNAME_DOMAIN } from './config.js';
import { useRoute, match, Loading, ErrorBox, Icon } from './ui.js';
import { AuthScreen, SetNewPassword } from './auth.js';
import { TeacherHome, AssignmentEditor, GradeSubmission, Progress, StudentsPage } from './teacher.js';
import { StudentHome, DoAssignment, ResultView } from './student.js';
import { ClassworkList, ClassworkNew, ClassworkDetail } from './classwork.js';
import { AdminPage } from './admin.js';

function SetupNeeded() {
  return html`
    <main class="content narrow">
      <div class="card">
        <h1>Chưa kết nối cơ sở dữ liệu</h1>
        <p>Mở file <code>js/config.js</code> và điền <b>SUPABASE_URL</b> cùng <b>SUPABASE_ANON_KEY</b>
           theo hướng dẫn trong <code>HUONG-DAN.md</code>.</p>
      </div>
    </main>`;
}

const loginName = (email = '') => email.endsWith('@' + USERNAME_DOMAIN) ? email.split('@')[0] : email;
const initials = (name = '') => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';

function navFor(profile) {
  if (profile.role !== 'teacher') {
    return [
      { href: '/', label: 'Bài của em', icon: 'clipboard' },
      { href: '/tren-lop', label: 'Kiểm tra bài trên lớp', icon: 'camera' },
    ];
  }
  return [
    { href: '/', label: 'Tổng quan', icon: 'home' },
    { href: '/bai/moi', label: 'Giao bài mới', icon: 'plus' },
    { href: '/tren-lop', label: 'Bài trên lớp', icon: 'camera' },
    { href: '/tien-do', label: 'Tiến độ học tập', icon: 'chart' },
    { href: '/hoc-sinh', label: 'Học sinh', icon: 'users' },
    ...(profile.is_admin ? [{ href: '/admin', label: 'Quản trị', icon: 'shield' }] : []),
  ];
}

function Shell({ profile, email, path, children }) {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  const items = navFor(profile);
  const isActive = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const roleLabel = profile.is_admin ? 'Quản trị viên' : profile.role === 'teacher' ? 'Người giao bài' : `Học sinh${profile.grade ? ' · Lớp ' + profile.grade : ''}`;

  return html`
    <div class=${'shell ' + (drawer ? 'drawer-open' : '')}>
      <aside class="sidebar">
        <a class="brand" href="#/"><span class="brand-mark"><${Icon} name="book" /></span> Góc Học Tập</a>
        <nav class="nav">
          ${items.map((it) => html`
            <a class=${'nav-item ' + (isActive(it.href) ? 'active' : '')} href=${'#' + it.href}>
              <${Icon} name=${it.icon} /> <span>${it.label}</span>
            </a>`)}
        </nav>
        <div class="user-card">
          <div class="avatar">${initials(profile.full_name)}</div>
          <div class="user-meta">
            <div class="user-name">${profile.full_name}</div>
            <div class="user-sub">${roleLabel}</div>
            <div class="user-sub mono">${loginName(email)}</div>
          </div>
          <button class="icon-btn" title="Đăng xuất" aria-label="Đăng xuất" onClick=${() => sb.auth.signOut({ scope: 'local' })}>
            <${Icon} name="logout" />
          </button>
        </div>
      </aside>
      <div class="scrim" onClick=${() => setDrawer(false)}></div>
      <div class="main">
        <header class="mobile-top">
          <button class="icon-btn" aria-label="Mở menu" onClick=${() => setDrawer(true)}><${Icon} name="menu" /></button>
          <a class="brand" href="#/"><span class="brand-mark sm"><${Icon} name="book" size=${16} /></span> Góc Học Tập</a>
          <div class="avatar sm">${initials(profile.full_name)}</div>
        </header>
        <main class="content">${children}</main>
      </div>
    </div>`;
}

function TeacherRoutes({ path, profile }) {
  let m;
  if (path === '/') return html`<${TeacherHome} profile=${profile} />`;
  if (path === '/bai/moi') return html`<${AssignmentEditor} profile=${profile} />`;
  if ((m = match('/bai/:id', path))) return html`<${AssignmentEditor} key=${m.id} profile=${profile} id=${m.id} />`;
  if ((m = match('/nhan-ban/:id', path))) return html`<${AssignmentEditor} key=${'c' + m.id} profile=${profile} copyFrom=${m.id} />`;
  if ((m = match('/cham/:id', path))) return html`<${GradeSubmission} key=${m.id} id=${m.id} />`;
  if (path === '/tien-do') return html`<${Progress} profile=${profile} />`;
  if (path === '/hoc-sinh') return html`<${StudentsPage} profile=${profile} />`;
  if (path === '/tren-lop') return html`<${ClassworkList} profile=${profile} />`;
  if (path === '/tren-lop/moi') return html`<${ClassworkNew} profile=${profile} />`;
  if ((m = match('/tren-lop/:id', path))) return html`<${ClassworkDetail} key=${m.id} id=${m.id} profile=${profile} />`;
  if (path === '/admin' && profile.is_admin) return html`<${AdminPage} profile=${profile} />`;
  return html`<${NotFound} />`;
}

function StudentRoutes({ path, profile }) {
  let m;
  if (path === '/') return html`<${StudentHome} profile=${profile} />`;
  if ((m = match('/lam/:id', path))) return html`<${DoAssignment} key=${m.id} profile=${profile} assignmentId=${m.id} />`;
  if ((m = match('/ket-qua/:id', path))) return html`<${ResultView} key=${m.id} id=${m.id} />`;
  if (path === '/tren-lop') return html`<${ClassworkList} profile=${profile} />`;
  if (path === '/tren-lop/moi') return html`<${ClassworkNew} profile=${profile} />`;
  if ((m = match('/tren-lop/:id', path))) return html`<${ClassworkDetail} key=${m.id} id=${m.id} profile=${profile} />`;
  return html`<${NotFound} />`;
}

const NotFound = () => html`<div class="card center">Không tìm thấy trang. <a href="#/">Về trang chính</a></div>`;

function App() {
  const path = useRoute();
  const [session, setSession] = useState(undefined); // undefined = đang kiểm tra
  const [profile, setProfile] = useState(undefined);
  const [err, setErr] = useState('');
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session && session.user.id;
  useEffect(() => {
    setErr('');
    setProfile(undefined);
    if (!uid) return;
    q(sb.from('profiles').select('*').eq('id', uid).maybeSingle())
      .then((p) => (p ? setProfile(p) : setErr('Không tìm thấy hồ sơ của tài khoản này.')))
      .catch((e) => setErr(e.message));
  }, [uid]);

  if (session === undefined) return html`<${Loading} />`;
  if (!session) return html`<${AuthScreen} />`;
  if (err) return html`<main class="content narrow"><${ErrorBox} msg=${err} />
    <button class="btn" onClick=${() => sb.auth.signOut({ scope: 'local' })}>Đăng xuất</button></main>`;
  if (!profile) return html`<${Loading} />`;

  return html`
    <${Shell} profile=${profile} email=${session.user.email} path=${path}>
      ${profile.role === 'teacher'
        ? html`<${TeacherRoutes} path=${path} profile=${profile} />`
        : html`<${StudentRoutes} path=${path} profile=${profile} />`}
    </${Shell}>
    ${recovery && html`<${SetNewPassword} onDone=${() => setRecovery(false)} />`}`;
}

render(configured ? html`<${App} />` : html`<${SetupNeeded} />`, document.getElementById('app'));
