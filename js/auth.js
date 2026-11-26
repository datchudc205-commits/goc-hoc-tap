import { html, useState } from './lib.js';
import { sb, q, toEmail, viError } from './db.js';
import { ErrorBox, Icon, PasswordInput, Modal } from './ui.js';

// Có dấu tiếng Việt / khoảng trắng → người dùng đang gõ tên hiển thị chứ không phải tên đăng nhập
const looksLikeDisplayName = (s) => !s.includes('@') && /[^\x00-\x7F]|\s/.test(s.trim());
const hasVietnamese = (s) => /[^\x00-\x7F]/.test(s);

export function AuthScreen() {
  const [mode, setMode] = useState('login');
  return html`
    <div class="auth-split">
      <aside class="auth-brand">
        <div class="auth-brand-inner">
          <div class="brand-mark lg"><${Icon} name="book" size=${26} /></div>
          <h1>Góc Học Tập</h1>
          <p class="lead">Nền tảng giao bài, làm bài và chấm bài trực tuyến cho gia đình – có trợ lý AI.</p>
          <ul class="feature-list">
            <li><${Icon} name="clipboard" /> Giao bài từ xa, có hạn nộp và nhắc việc</li>
            <li><${Icon} name="sparkles" /> AI soạn đề theo SGK <b>Kết nối tri thức</b> và gợi ý chấm</li>
            <li><${Icon} name="camera" /> Chụp vở bài làm trên lớp – AI kiểm tra đúng/sai</li>
            <li><${Icon} name="chart" /> Theo dõi tiến độ, điểm mạnh – điểm yếu theo môn</li>
          </ul>
        </div>
      </aside>
      <main class="auth-main">
        <div class="auth-card">
          <div class="auth-mobile-brand"><div class="brand-mark"><${Icon} name="book" /></div> Góc Học Tập</div>
          <div class="segmented">
            <button class=${mode === 'login' ? 'active' : ''} onClick=${() => setMode('login')}>Đăng nhập</button>
            <button class=${mode === 'register' ? 'active' : ''} onClick=${() => setMode('register')}>Tạo tài khoản</button>
          </div>
          ${mode === 'login' ? html`<${Login} />` : html`<${Register} />`}
        </div>
      </main>
    </div>`;
}

function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [forgot, setForgot] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (looksLikeDisplayName(login)) {
      setErr({ msg: 'Tên đăng nhập không có dấu và khoảng trắng.', tips: [
        `Có vẻ bạn đang gõ tên hiển thị ("${login.trim()}"). Hãy dùng tên đăng nhập đã đặt lúc tạo tài khoản, VD: bena.`,
        'Người giao bài xem được tên đăng nhập của em trong mục "Học sinh".'] });
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.auth.signInWithPassword({ email: toEmail(login), password });
      if (error) {
        if (/invalid login credentials/i.test(error.message)) {
          const tips = [
            'Tắt bộ gõ tiếng Việt (Unikey/EVKey, hoặc chuyển bàn phím điện thoại sang tiếng Anh) rồi gõ lại mật khẩu. Bấm 👁 để xem mật khẩu đang gõ.',
            login.includes('@') ? 'Kiểm tra lại email (đúng email đã dùng khi tạo tài khoản).' : 'Học sinh: dùng tên đăng nhập (VD: bena), không phải tên hiển thị.',
            'Quên mật khẩu? Người giao bài/admin đặt lại được trong vài giây – bấm "Quên mật khẩu?" bên dưới.',
          ];
          if (hasVietnamese(password)) tips.unshift('Mật khẩu bạn vừa gõ có chữ tiếng Việt có dấu – rất có thể bộ gõ đã tự đổi chữ.');
          setErr({ msg: 'Sai tên đăng nhập hoặc mật khẩu.', tips });
        } else if (/banned/i.test(error.message)) {
          setErr({ msg: 'Tài khoản này đang bị khoá. Hãy liên hệ admin.' });
        } else {
          setErr({ msg: viError(error) });
        }
      }
    } catch (e2) {
      setErr({ msg: viError(e2) });
    }
    setBusy(false);
  }

  return html`
    <form onSubmit=${submit} class="stack">
      <div>
        <h2 class="auth-title">Chào mừng trở lại</h2>
        <p class="muted small">Đăng nhập để giao bài, làm bài và xem kết quả.</p>
      </div>
      <label>Email hoặc tên đăng nhập
        <input value=${login} onInput=${(e) => setLogin(e.target.value)} autocomplete="username"
               autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ban@gmail.com hoặc bena" required />
      </label>
      <label>Mật khẩu
        <${PasswordInput} value=${password} onInput=${(e) => setPassword(e.target.value)} />
      </label>
      ${err && html`<div class="alert error">
        <b>${err.msg}</b>
        ${err.tips && html`<ul class="tips">${err.tips.map((t) => html`<li>${t}</li>`)}</ul>`}
      </div>`}
      <button class="btn primary full lg" disabled=${busy}>${busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      <button type="button" class="link center-link" onClick=${() => setForgot(true)}>Quên mật khẩu?</button>
    </form>
    ${forgot && html`<${ForgotPassword} initial=${login} onClose=${() => setForgot(false)} />`}`;
}

function ForgotPassword({ initial, onClose }) {
  const [email, setEmail] = useState(initial.includes('@') ? initial : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function send() {
    setBusy(true); setErr(''); setMsg('');
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
    if (error) setErr(viError(error));
    else setMsg('Đã gửi! Mở email, bấm vào link "Reset Password" để đặt mật khẩu mới. (Xem cả thư mục Spam.)');
    setBusy(false);
  }
  return html`
    <${Modal} title="Quên mật khẩu" onClose=${onClose}>
      <div class="stack">
        <div class="info-box"><b>Học sinh:</b> nhờ người giao bài vào mục <b>Học sinh</b> → <b>Đặt lại mật khẩu</b>.</div>
        <div class="info-box"><b>Người giao bài:</b> nhờ admin đặt lại trong trang <b>Quản trị</b>, hoặc nhận link qua email:</div>
        <label>Email của bạn
          <input type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="ban@gmail.com" />
        </label>
        <${ErrorBox} msg=${err} />
        ${msg && html`<div class="alert ok">${msg}</div>`}
        <button class="btn primary" disabled=${busy || !email.includes('@')} onClick=${send}>${busy ? 'Đang gửi…' : 'Gửi link đặt lại mật khẩu'}</button>
      </div>
    </${Modal}>`;
}

// Hiện sau khi người dùng bấm link khôi phục trong email
export function SetNewPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault();
    if (pw.length < 6) { setErr('Mật khẩu cần ít nhất 6 ký tự.'); return; }
    setBusy(true); setErr('');
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr(viError(error)); else onDone();
  }
  return html`
    <${Modal} title="Đặt mật khẩu mới" onClose=${onDone}>
      <form class="stack" onSubmit=${save}>
        <p class="small muted">Nên tắt bộ gõ tiếng Việt khi gõ mật khẩu.</p>
        <label>Mật khẩu mới <${PasswordInput} value=${pw} onInput=${(e) => setPw(e.target.value)} autocomplete="new-password" minlength="6" /></label>
        <${ErrorBox} msg=${err} />
        <button class="btn primary" disabled=${busy}>${busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</button>
      </form>
    </${Modal}>`;
}

function Register() {
  const [role, setRole] = useState('teacher');
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [grade, setGrade] = useState('6');
  const [teacherName, setTeacherName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function checkCode() {
    setTeacherName(''); setErr('');
    if (!code.trim()) return;
    try {
      const n = await q(sb.rpc('check_invite_code', { p_code: code }));
      if (n) setTeacherName(n); else setErr('Mã mời không đúng.');
    } catch (e) { setErr(e.message); }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setInfo('');
    try {
      const l = login.trim();
      if (!l.includes('@') && !/^[A-Za-z0-9._-]+$/.test(l)) {
        throw new Error('Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang (VD: bena).');
      }
      if (hasVietnamese(password)) {
        throw new Error('Mật khẩu đang có chữ tiếng Việt có dấu (do bộ gõ). Hãy tắt bộ gõ tiếng Việt rồi gõ lại để lần sau đăng nhập không bị sai.');
      }
      if (role === 'student') {
        const n = await q(sb.rpc('check_invite_code', { p_code: code }));
        if (!n) throw new Error('Mã mời không đúng. Hãy hỏi lại người giao bài.');
      }
      const { data, error } = await sb.auth.signUp({
        email: toEmail(l),
        password,
        options: { data: { full_name: name.trim(), role, invite_code: role === 'student' ? code.trim() : '', grade: role === 'student' ? grade : '' } },
      });
      if (error) throw error;
      if (!data.session) setInfo('Đã tạo tài khoản! Hãy mở email để xác nhận rồi đăng nhập.');
    } catch (e2) {
      setErr(viError(e2));
    }
    setBusy(false);
  }

  return html`
    <form onSubmit=${submit} class="stack">
      <div>
        <h2 class="auth-title">Tạo tài khoản</h2>
        <p class="muted small">Người giao bài tạo trước, rồi gửi mã mời cho học sinh.</p>
      </div>
      <div class="role-pick">
        <label class=${'role ' + (role === 'teacher' ? 'on' : '')}>
          <input type="radio" name="role" checked=${role === 'teacher'} onChange=${() => setRole('teacher')} />
          <span class="role-ico"><${Icon} name="clipboard" size=${22} /></span>
          <b>Người giao bài</b><span class="small muted">Phụ huynh, anh chị</span>
        </label>
        <label class=${'role ' + (role === 'student' ? 'on' : '')}>
          <input type="radio" name="role" checked=${role === 'student'} onChange=${() => setRole('student')} />
          <span class="role-ico"><${Icon} name="book" size=${22} /></span>
          <b>Học sinh</b><span class="small muted">Cần mã mời</span>
        </label>
      </div>

      <label>Tên hiển thị
        <input value=${name} onInput=${(e) => setName(e.target.value)} placeholder=${role === 'teacher' ? 'VD: Anh Hai' : 'VD: Bé Na'} required />
      </label>

      <label>${role === 'teacher' ? 'Email' : 'Tên đăng nhập'}
        <input value=${login} onInput=${(e) => setLogin(e.target.value)} autocomplete="username"
               autocapitalize="off" autocorrect="off" spellcheck="false"
               type=${role === 'teacher' ? 'email' : 'text'}
               placeholder=${role === 'teacher' ? 'ban@gmail.com' : 'VD: bena (viết liền, không dấu)'} required />
        ${role === 'student' && html`<span class="hint">Ghi nhớ tên này – đây là tên dùng để đăng nhập (không phải tên hiển thị).</span>`}
      </label>

      <label>Mật khẩu (ít nhất 6 ký tự)
        <${PasswordInput} value=${password} onInput=${(e) => setPassword(e.target.value)} autocomplete="new-password" minlength="6" />
        <span class="hint">Tắt bộ gõ tiếng Việt khi gõ mật khẩu.</span>
      </label>

      ${role === 'student' && html`
        <div class="grid2">
          <label>Lớp
            <select value=${grade} onChange=${(e) => setGrade(e.target.value)}>
              ${Array.from({ length: 12 }, (_, i) => String(i + 1)).map((g) => html`<option value=${g}>Lớp ${g}</option>`)}
            </select>
          </label>
          <label>Mã mời
            <div class="row">
              <input value=${code} onInput=${(e) => { setCode(e.target.value.toUpperCase()); setTeacherName(''); }}
                     onBlur=${checkCode} placeholder="K7M2QX" maxlength="6" class="code-input" required />
            </div>
          </label>
        </div>
        ${teacherName && html`<div class="alert ok">✔ Mã đúng – em sẽ nhận bài từ <b>${teacherName}</b>.</div>`}
      `}

      <${ErrorBox} msg=${err} />
      ${info && html`<div class="alert ok">${info}</div>`}
      <button class="btn primary full lg" disabled=${busy}>${busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
    </form>`;
}
