import { html, useState } from './lib.js';
import { sb, q, toEmail, viError } from './db.js';
import { ErrorBox } from './ui.js';

export function AuthScreen() {
  const [mode, setMode] = useState('login');
  return html`
    <main class="wrap narrow">
      <div class="hero">
        <div class="logo">📘</div>
        <h1>Góc Học Tập</h1>
        <p class="muted">Giao bài – làm bài – chấm bài online</p>
      </div>
      <div class="tabs">
        <button class=${mode === 'login' ? 'active' : ''} onClick=${() => setMode('login')}>Đăng nhập</button>
        <button class=${mode === 'register' ? 'active' : ''} onClick=${() => setMode('register')}>Tạo tài khoản</button>
      </div>
      <div class="card">
        ${mode === 'login' ? html`<${Login} />` : html`<${Register} onDone=${() => setMode('login')} />`}
      </div>
    </main>`;
}

function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await sb.auth.signInWithPassword({ email: toEmail(login), password });
    if (error) setErr(viError(error));
    setBusy(false);
  }

  return html`
    <form onSubmit=${submit}>
      <label>Email hoặc tên đăng nhập
        <input value=${login} onInput=${(e) => setLogin(e.target.value)} autocomplete="username" required />
      </label>
      <label>Mật khẩu
        <input type="password" value=${password} onInput=${(e) => setPassword(e.target.value)}
               autocomplete="current-password" required />
      </label>
      <${ErrorBox} msg=${err} />
      <button class="btn primary full" disabled=${busy}>${busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>`;
}

function Register({ onDone }) {
  const [role, setRole] = useState('teacher');
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
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
      if (role === 'student') {
        const n = await q(sb.rpc('check_invite_code', { p_code: code }));
        if (!n) throw new Error('Mã mời không đúng. Hãy hỏi lại người giao bài.');
      }
      const { data, error } = await sb.auth.signUp({
        email: toEmail(login),
        password,
        options: { data: { full_name: name.trim(), role, invite_code: role === 'student' ? code.trim() : '' } },
      });
      if (error) throw error;
      if (!data.session) {
        setInfo('Đã tạo tài khoản! Hãy mở email để xác nhận rồi đăng nhập.');
        onDone && setTimeout(onDone, 4000);
      }
    } catch (e2) {
      setErr(viError(e2));
    }
    setBusy(false);
  }

  return html`
    <form onSubmit=${submit}>
      <div class="role-pick">
        <label class=${'role ' + (role === 'teacher' ? 'on' : '')}>
          <input type="radio" name="role" checked=${role === 'teacher'} onChange=${() => setRole('teacher')} />
          <span class="big">🧑‍🏫</span> Người giao bài
        </label>
        <label class=${'role ' + (role === 'student' ? 'on' : '')}>
          <input type="radio" name="role" checked=${role === 'student'} onChange=${() => setRole('student')} />
          <span class="big">🧒</span> Học sinh
        </label>
      </div>

      <label>Tên hiển thị
        <input value=${name} onInput=${(e) => setName(e.target.value)} placeholder=${role === 'teacher' ? 'VD: Anh Hai' : 'VD: Bé Na'} required />
      </label>

      <label>${role === 'teacher' ? 'Email' : 'Tên đăng nhập (hoặc email)'}
        <input value=${login} onInput=${(e) => setLogin(e.target.value)} autocomplete="username"
               type=${role === 'teacher' ? 'email' : 'text'}
               placeholder=${role === 'teacher' ? 'ban@gmail.com' : 'VD: bena (viết liền, không dấu)'}
               pattern=${role === 'teacher' ? null : '[A-Za-z0-9._@\\-]+'} required />
      </label>

      <label>Mật khẩu (ít nhất 6 ký tự)
        <input type="password" minlength="6" value=${password} onInput=${(e) => setPassword(e.target.value)}
               autocomplete="new-password" required />
      </label>

      ${role === 'student' && html`
        <label>Mã mời (người giao bài đưa cho em)
          <div class="row">
            <input value=${code} onInput=${(e) => { setCode(e.target.value.toUpperCase()); setTeacherName(''); }}
                   onBlur=${checkCode} placeholder="VD: K7M2QX" maxlength="6" class="code-input" required />
            <button type="button" class="btn" onClick=${checkCode}>Kiểm tra</button>
          </div>
        </label>
        ${teacherName && html`<div class="alert ok">✔ Mã đúng – em sẽ nhận bài từ <b>${teacherName}</b>.</div>`}
      `}

      <${ErrorBox} msg=${err} />
      ${info && html`<div class="alert ok">${info}</div>`}
      <button class="btn primary full" disabled=${busy}>${busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
    </form>`;
}
