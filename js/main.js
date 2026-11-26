import { html, render, useState, useEffect } from './lib.js';
import { sb, configured, q } from './db.js';
import { USERNAME_DOMAIN } from './config.js';
import { useRoute, match, Loading, ErrorBox, Icon, Avatar, Toaster, DialogHost, confirmDialog, useTheme, applyTheme } from './ui.js';
import { AuthScreen, SetNewPassword } from './auth.js';
import { TeacherHome, AssignmentEditor, GradeSubmission, Progress, StudentsPage } from './teacher.js';
import { StudentHome, DoAssignment, ResultView } from './student.js';
import { ClassworkList, ClassworkNew, ClassworkDetail } from './classwork.js';
import { AdminPage } from './admin.js';
import { TeacherRewards, StudentStars } from './rewards.js';

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

// Nhóm menu + số đếm việc cần làm (badge)
function navFor(profile, c = {}) {
  if (profile.role !== 'teacher') {
    return [
      { group: 'Học tập', items: [
        { href: '/', label: 'Bài của em', short: 'Bài tập', icon: 'clipboard', badge: c.todo },
        { href: '/tren-lop', label: 'Kiểm tra bài trên lớp', short: 'Trên lớp', icon: 'camera' },
        { href: '/sao', label: 'Sao & phần thưởng', short: 'Sao', icon: 'star', badge: c.tasks },
      ] },
    ];
  }
  return [
    { group: 'Tổng quan', items: [
      { href: '/', label: 'Bảng điều khiển', short: 'Tổng quan', icon: 'home', badge: c.submitted, badgeTone: 'warn' },
    ] },
    { group: 'Giảng dạy', items: [
      { href: '/bai/moi', label: 'Giao bài mới', short: 'Giao bài', icon: 'plus' },
      { href: '/tren-lop', label: 'Bài trên lớp', short: 'Trên lớp', icon: 'camera', badge: c.classwork },
      { href: '/tien-do', label: 'Tiến độ học tập', short: 'Tiến độ', icon: 'chart' },
    ] },
    { group: 'Quản lý', items: [
      { href: '/thuong-phat', label: 'Thưởng & thử thách', short: 'Thưởng', icon: 'star', badge: c.rewards, badgeTone: 'warn' },
      { href: '/hoc-sinh', label: 'Học sinh', short: 'Học sinh', icon: 'users' },
      ...(profile.is_admin ? [{ href: '/admin', label: 'Quản trị hệ thống', short: 'Quản trị', icon: 'shield' }] : []),
    ] },
  ];
}

async function loadCounts(profile) {
  if (profile.role === 'teacher') {
    const [sub, cw, rq, tk] = await Promise.all([
      sb.from('submissions').select('id, assignments!inner(teacher_id)', { count: 'exact', head: true })
        .eq('status', 'submitted').eq('assignments.teacher_id', profile.id),
      sb.from('classwork').select('id, profiles!classwork_student_id_fkey!inner(teacher_id)', { count: 'exact', head: true })
        .is('reviewed_at', null).eq('status', 'checked').eq('profiles.teacher_id', profile.id),
      sb.from('reward_requests').select('id, profiles!reward_requests_student_id_fkey!inner(teacher_id)', { count: 'exact', head: true })
        .eq('status', 'pending').eq('profiles.teacher_id', profile.id),
      sb.from('tasks').select('id', { count: 'exact', head: true }).eq('teacher_id', profile.id).eq('status', 'done'),
    ]);
    return { submitted: sub.count || 0, classwork: cw.count || 0, rewards: (rq.count || 0) + (tk.count || 0) };
  }
  const [{ data }, tk] = await Promise.all([
    sb.from('assignments').select('id, submissions(status)').eq('student_id', profile.id).eq('published', true),
    sb.from('tasks').select('id', { count: 'exact', head: true }).eq('student_id', profile.id).eq('status', 'todo'),
  ]);
  return { todo: (data || []).filter((a) => !a.submissions[0] || a.submissions[0].status === 'in_progress').length, tasks: tk.count || 0 };
}

const THEME_LABEL = { light: 'Giao diện sáng', dark: 'Giao diện tối', system: 'Theo hệ thống' };
const THEME_ICON = { light: 'sun', dark: 'moon', system: 'monitor' };

function Shell({ profile, email, path, children }) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(localStorage.getItem('nav-collapsed') === '1');
  const [counts, setCounts] = useState({});
  const [theme, cycleTheme] = useTheme();
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => { loadCounts(profile).then(setCounts).catch(() => {}); }, [path]);
  const groups = navFor(profile, counts);
  const flat = groups.flatMap((g) => g.items);
  const isActive = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const roleLabel = profile.is_admin ? 'Quản trị viên' : profile.role === 'teacher' ? 'Người giao bài' : `Học sinh${profile.grade ? ' · Lớp ' + profile.grade : ''}`;
  const toggleCollapse = () => { localStorage.setItem('nav-collapsed', collapsed ? '0' : '1'); setCollapsed(!collapsed); };
  const logout = async () => {
    if (await confirmDialog({ title: 'Đăng xuất?', message: 'Bạn sẽ cần nhập lại mật khẩu để vào app.', confirmText: 'Đăng xuất' })) {
      sb.auth.signOut({ scope: 'local' });
    }
  };
  const bottom = flat.slice(0, 4);

  return html`
    <div class=${'shell ' + (drawer ? 'drawer-open ' : '') + (collapsed ? 'collapsed' : '')}>
      <aside class="sidebar" aria-label="Điều hướng chính">
        <div class="side-head">
          <a class="brand" href="#/"><span class="brand-mark"><${Icon} name="book" /></span><span class="brand-text">Góc Học Tập</span></a>
          <button class="icon-btn ghost collapse-btn" title=${collapsed ? 'Mở rộng menu' : 'Thu gọn menu'} onClick=${toggleCollapse}>
            <${Icon} name=${collapsed ? 'chevronRight' : 'chevronLeft'} />
          </button>
        </div>
        <nav class="nav">
          ${groups.map((g) => html`
            <div class="nav-group">
              <div class="nav-label">${g.group}</div>
              ${g.items.map((it) => html`
                <a class=${'nav-item ' + (isActive(it.href) ? 'active' : '')} href=${'#' + it.href}
                   aria-current=${isActive(it.href) ? 'page' : null} title=${collapsed ? it.label : null}>
                  <${Icon} name=${it.icon} /> <span class="nav-text">${it.label}</span>
                  ${it.badge > 0 && html`<span class=${'nav-badge ' + (it.badgeTone || '')}>${it.badge}</span>`}
                </a>`)}
            </div>`)}
        </nav>
        <button class="nav-item theme-btn" onClick=${cycleTheme} title=${THEME_LABEL[theme]}>
          <${Icon} name=${THEME_ICON[theme]} /> <span class="nav-text">${THEME_LABEL[theme]}</span>
        </button>
        <div class="user-card">
          <${Avatar} name=${profile.full_name} />
          <div class="user-meta">
            <div class="user-name">${profile.full_name}</div>
            <div class="user-sub">${roleLabel}</div>
            <div class="user-sub mono">${loginName(email)}</div>
          </div>
          <button class="icon-btn ghost" title="Đăng xuất" aria-label="Đăng xuất" onClick=${logout}><${Icon} name="logout" /></button>
        </div>
      </aside>
      <div class="scrim" onClick=${() => setDrawer(false)}></div>
      <div class="main">
        <header class="mobile-top">
          <a class="brand" href="#/"><span class="brand-mark sm"><${Icon} name="book" size=${16} /></span> Góc Học Tập</a>
          <div class="row">
            <button class="icon-btn ghost" aria-label=${THEME_LABEL[theme]} onClick=${cycleTheme}><${Icon} name=${THEME_ICON[theme]} /></button>
            <button class="avatar-btn" aria-label="Tài khoản và menu" onClick=${() => setDrawer(true)}><${Avatar} name=${profile.full_name} size="sm" /></button>
          </div>
        </header>
        <main class="content" id="main">${children}</main>
        <nav class="bottom-nav" aria-label="Điều hướng nhanh">
          ${bottom.map((it) => html`
            <a class=${'bn-item ' + (isActive(it.href) ? 'active' : '')} href=${'#' + it.href}>
              <span class="bn-ico"><${Icon} name=${it.icon} size=${21} />${it.badge > 0 && html`<i class="bn-dot">${it.badge}</i>`}</span>
              <span>${it.short}</span>
            </a>`)}
          <button class="bn-item" onClick=${() => setDrawer(true)}><span class="bn-ico"><${Icon} name="menu" size=${21} /></span><span>Thêm</span></button>
        </nav>
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
  if (path === '/thuong-phat') return html`<${TeacherRewards} profile=${profile} />`;
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
  if (path === '/sao') return html`<${StudentStars} profile=${profile} />`;
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
      <div class="page-enter" key=${path}>
        ${profile.role === 'teacher'
          ? html`<${TeacherRoutes} path=${path} profile=${profile} />`
          : html`<${StudentRoutes} path=${path} profile=${profile} />`}
      </div>
    </${Shell}>
    ${recovery && html`<${SetNewPassword} onDone=${() => setRecovery(false)} />`}`;
}

const Root = () => html`${configured ? html`<${App} />` : html`<${SetupNeeded} />`}<${Toaster} /><${DialogHost} />`;
applyTheme();
render(html`<${Root} />`, document.getElementById('app'));
