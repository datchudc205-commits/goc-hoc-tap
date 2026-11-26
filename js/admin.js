// Trang quản trị: thống kê hệ thống + quản lý toàn bộ tài khoản
import { html, useState } from './lib.js';
import { rpc } from './db.js';
import { useLoad, Loading, ErrorBox, fmtDate, fmtNum, Icon, Modal, confirmDialog, toast, Avatar, relTime } from './ui.js';
import { ResetPasswordModal } from './teacher.js';

const ROLE = {
  admin: { label: 'Quản trị viên', cls: 'tag violet' },
  teacher: { label: 'Người giao bài', cls: 'tag blue' },
  student: { label: 'Học sinh', cls: 'tag green' },
};

export function AdminPage({ profile }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const [msg, setMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [data, err, reload] = useLoad(async () => {
    const [stats, users] = await Promise.all([rpc('admin_stats'), rpc('admin_list_users')]);
    return { stats, users };
  });

  if (err) return html`<${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;
  const { stats, users } = data;
  const teachers = users.filter((u) => u.role === 'teacher');
  const s = search.trim().toLowerCase();
  const shown = users.filter((u) =>
    (roleFilter === 'all' || (roleFilter === 'admin' ? u.is_admin : u.role === roleFilter))
    && (!s || u.full_name.toLowerCase().includes(s) || (u.login || '').toLowerCase().includes(s)));

  async function act(fn, ok) {
    setMsg(''); setActionErr('');
    try { await fn(); toast(ok); reload(); } catch (e) { setActionErr(e.message); toast(e.message, 'error'); }
  }
  const toggleBan = async (u) => {
    if (!u.banned && !(await confirmDialog({ title: 'Khoá tài khoản?', confirmText: 'Khoá', danger: true,
      message: `${u.full_name} sẽ không đăng nhập được cho tới khi được mở khoá.` }))) return;
    act(() => rpc('admin_set_banned', { p_user: u.id, p_banned: !u.banned }),
      u.banned ? `Đã mở khoá ${u.full_name}.` : `Đã khoá ${u.full_name}.`);
  };
  const remove = async (u) => {
    const ok = await confirmDialog({ title: 'Xoá tài khoản?', danger: true, confirmText: 'Xoá vĩnh viễn',
      message: `Tài khoản "${u.full_name}" (${u.login}) sẽ bị xoá vĩnh viễn.\nToàn bộ bài tập, bài làm và điểm của tài khoản này cũng bị xoá và KHÔNG khôi phục được.` });
    if (ok) act(() => rpc('admin_delete_user', { p_user: u.id }), `Đã xoá ${u.full_name}.`);
  };

  const STATS = [
    ['users', 'Người giao bài', stats.teachers, 'blue'],
    ['book', 'Học sinh', stats.students, 'green'],
    ['clipboard', 'Bài đã giao', stats.published, 'violet'],
    ['chart', 'Điểm TB toàn hệ thống', stats.avg10 == null ? '–' : fmtNum(stats.avg10), 'warn'],
    ['check', 'Bài đã chấm', stats.returned, 'green'],
    ['clipboard', 'Bài chờ chấm', stats.submitted, 'warn'],
    ['camera', 'Lượt kiểm tra trên lớp', stats.classwork, 'violet'],
    ['shield', 'Hoạt động 7 ngày', stats.active7, 'blue'],
  ];

  return html`
    <div class="page-head">
      <div>
        <h1>Quản trị hệ thống</h1>
        <p class="page-sub">Toàn bộ tài khoản và hoạt động trên Góc Học Tập.</p>
      </div>
      <button class="btn" onClick=${reload}>Làm mới</button>
    </div>

    <div class="stats-grid">
      ${STATS.map(([ico, label, val, tone]) => html`
        <div class="stat-card"><span class=${'stat-ico ' + tone}><${Icon} name=${ico} /></span>
          <span class="stat-num">${val}</span><span class="stat-label">${label}</span></div>`)}
    </div>

    <div class="section-bar">
      <h2>Tài khoản <small class="muted">(${users.length})</small></h2>
      <div class="toolbar">
        <div class="search"><${Icon} name="search" size=${16} />
          <input placeholder="Tìm theo tên, tên đăng nhập…" value=${search} onInput=${(e) => setSearch(e.target.value)} /></div>
        <select class="select-sm" value=${roleFilter} onChange=${(e) => setRoleFilter(e.target.value)}>
          <option value="all">Tất cả vai trò</option><option value="admin">Quản trị viên</option>
          <option value="teacher">Người giao bài</option><option value="student">Học sinh</option>
        </select>
      </div>
    </div>
    ${msg && html`<div class="alert ok">${msg}</div>`}
    <${ErrorBox} msg=${actionErr} />

    <div class="card table-card">
      <table class="table">
        <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Lớp / người giao bài</th><th>Hoạt động</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>
          ${shown.map((u) => {
            const r = u.is_admin ? ROLE.admin : ROLE[u.role];
            return html`
              <tr class=${u.banned ? 'row-muted' : ''}>
                <td data-label="Tài khoản"><div class="cell-user">
                  <${Avatar} name=${u.full_name} size="sm" />
                  <div><b>${u.full_name}</b>${u.id === profile.id ? html` <span class="muted small">(bạn)</span>` : ''}
                    <div class="mono small muted">${u.login}</div></div></div></td>
                <td data-label="Vai trò"><span class=${r.cls}>${r.label}</span>
                  ${u.role === 'teacher' && u.invite_code && html`<div class="mono small muted">Mã: ${u.invite_code}</div>`}</td>
                <td data-label="Lớp / người giao bài" class="small">
                  ${u.role === 'student' ? html`${u.grade ? 'Lớp ' + u.grade : 'Chưa có lớp'}<div class="muted">↳ ${u.teacher_name || '—'}</div>`
                    : html`<span class="muted">${u.n_assignments} bài đã giao</span>`}</td>
                <td data-label="Hoạt động" class="small">
                  <div>${u.last_sign_in_at ? 'Đăng nhập ' + relTime(u.last_sign_in_at) : html`<span class="muted">Chưa đăng nhập</span>`}</div>
                  <div class="muted">Tạo ${fmtDate(u.created_at, false)}${u.role === 'student' ? ` · ${u.n_returned} bài có điểm` : ''}</div></td>
                <td data-label="Trạng thái">${u.banned ? html`<span class="tag red">Đã khoá</span>` : html`<span class="tag green">Hoạt động</span>`}</td>
                <td class="actions">
                  <button class="icon-btn" title="Sửa" onClick=${() => setEditing(u)}><${Icon} name="edit" /></button>
                  <button class="icon-btn" title="Đặt lại mật khẩu" onClick=${() => setResetFor(u)}><${Icon} name="key" /></button>
                  ${u.id !== profile.id && html`
                    <button class="icon-btn" title=${u.banned ? 'Mở khoá' : 'Khoá tài khoản'} onClick=${() => toggleBan(u)}>
                      <${Icon} name=${u.banned ? 'unlock' : 'lock'} /></button>
                    <button class="icon-btn danger" title="Xoá tài khoản" onClick=${() => remove(u)}><${Icon} name="trash" /></button>`}
                </td>
              </tr>`;
          })}
        </tbody>
      </table>
      ${shown.length === 0 && html`<p class="center muted pad">Không có tài khoản phù hợp.</p>`}
    </div>

    ${editing && html`<${EditUser} user=${editing} teachers=${teachers} self=${profile.id}
      onClose=${() => setEditing(null)} onSaved=${(name) => { setEditing(null); toast(`Đã cập nhật ${name}.`); reload(); }} />`}
    ${resetFor && html`<${ResetPasswordModal} user=${resetFor} onClose=${() => setResetFor(null)} />`}`;
}

function EditUser({ user, teachers, self, onClose, onSaved }) {
  const [name, setName] = useState(user.full_name);
  const [role, setRole] = useState(user.role);
  const [teacher, setTeacher] = useState(user.teacher_id || (teachers.find((t) => t.id !== user.id) || {}).id || '');
  const [grade, setGrade] = useState(user.grade ? String(user.grade) : '');
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isSelf = user.id === self;

  async function save() {
    setBusy(true); setErr('');
    try {
      await rpc('admin_update_user', {
        p_user: user.id, p_full_name: name, p_role: role,
        p_teacher: role === 'student' ? teacher || null : null,
        p_grade: grade ? Number(grade) : null, p_is_admin: role === 'teacher' && isAdmin,
      });
      onSaved(name);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return html`
    <${Modal} title=${'Sửa tài khoản – ' + user.login} onClose=${onClose}
      footer=${html`<button class="btn" onClick=${onClose}>Huỷ</button>
        <button class="btn primary" disabled=${busy} onClick=${save}>${busy ? 'Đang lưu…' : 'Lưu'}</button>`}>
      <div class="stack">
        <label>Tên hiển thị <input value=${name} onInput=${(e) => setName(e.target.value)} /></label>
        <div class="grid2">
          <label>Vai trò
            <select value=${role} disabled=${isSelf} onChange=${(e) => setRole(e.target.value)}>
              <option value="teacher">Người giao bài</option><option value="student">Học sinh</option>
            </select>
          </label>
          <label>Lớp
            <select value=${grade} onChange=${(e) => setGrade(e.target.value)}>
              <option value="">—</option>
              ${Array.from({ length: 12 }, (_, i) => String(i + 1)).map((g) => html`<option value=${g}>Lớp ${g}</option>`)}
            </select>
          </label>
        </div>
        ${role === 'student' && html`
          <label>Người giao bài
            <select value=${teacher} onChange=${(e) => setTeacher(e.target.value)}>
              ${teachers.filter((t) => t.id !== user.id).map((t) => html`<option value=${t.id}>${t.full_name} (${t.login})</option>`)}
            </select>
          </label>`}
        ${role === 'teacher' && html`
          <label class="check-row">
            <input type="checkbox" checked=${isAdmin} disabled=${isSelf} onChange=${(e) => setIsAdmin(e.target.checked)} />
            Quyền quản trị viên (xem và quản lý mọi tài khoản)
          </label>`}
        ${isSelf && html`<p class="small muted">Không thể tự đổi vai trò hoặc bỏ quyền admin của chính mình.</p>`}
        <${ErrorBox} msg=${err} />
      </div>
    </${Modal}>`;
}
