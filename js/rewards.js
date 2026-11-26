// Thưởng sao ⭐, cửa hàng phần thưởng 🎁 và thử thách nhỏ (thay cho hình phạt – nhẹ nhàng, tích cực)
import { html, useState } from './lib.js';
import { sb, q, rpc } from './db.js';
import { useLoad, Loading, ErrorBox, Icon, Modal, toast, confirmDialog, EmptyState, Avatar, relTime, fmtDate } from './ui.js';

export const STAR_RULES = [
  ['+1 ⭐', 'Nộp bài đúng hạn'],
  ['+3 ⭐', 'Điểm từ 9 trở lên'],
  ['+2 ⭐', 'Điểm từ 7 đến dưới 9'],
  ['+1 ⭐', 'Điểm từ 5 đến dưới 7'],
  ['+1 ⭐', 'Hoàn thành một thử thách nhỏ'],
  ['−1 ⭐', 'Nộp muộn (không bao giờ trừ xuống dưới 0)'],
];

const TASK_PRESETS = [
  '📖 Đọc sách thêm 15 phút',
  '✏️ Làm lại các câu sai và giải thích cho anh nghe',
  '🧹 Dọn gọn góc học tập',
  '📝 Chép lại bài cho sạch đẹp',
  '🧮 Luyện thêm 5 câu toán',
  '📱 Bớt 15 phút xem điện thoại hôm nay',
];
const PRAISE_PRESETS = ['Chăm chỉ làm bài', 'Tự giác học bài', 'Giúp đỡ gia đình', 'Tiến bộ rõ rệt', 'Đạt điểm tốt ở trường'];
const REMIND_PRESETS = ['Quên làm bài', 'Làm bài cẩu thả', 'Chưa tập trung'];
const REWARD_PRESETS = [['📺', '30 phút xem TV', 10], ['🎮', '30 phút chơi game', 10], ['🍦', 'Đi ăn kem', 20], ['📚', 'Mua 1 quyển truyện', 30], ['🎡', 'Đi chơi cuối tuần', 50]];

const STATUS_TASK = { todo: ['Đang chờ em làm', 'tag blue'], done: ['Em báo đã xong', 'tag orange'], confirmed: ['Đã hoàn thành', 'tag green'] };

// =====================================================================
//  Người giao bài
// =====================================================================
export function TeacherRewards({ profile }) {
  const [studentId, setStudentId] = useState('');
  const [modal, setModal] = useState(null); // 'stars' | 'task'
  const [data, err, reload] = useLoad(async () => {
    const students = await rpc('my_students');
    const ids = students.map((s) => s.id);
    if (!ids.length) return { students, events: [], rewards: [], requests: [], tasks: [] };
    const [events, rewards, requests, tasks] = await Promise.all([
      q(sb.from('star_events').select('*').in('student_id', ids).order('created_at', { ascending: false }).limit(200)),
      q(sb.from('rewards').select('*').eq('teacher_id', profile.id).order('cost')),
      q(sb.from('reward_requests').select('*, rewards(title, icon, cost)').in('student_id', ids).order('created_at', { ascending: false }).limit(50)),
      q(sb.from('tasks').select('*').in('student_id', ids).order('created_at', { ascending: false }).limit(50)),
    ]);
    return { students, events, rewards, requests, tasks };
  });

  if (err) return html`<${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;
  if (!data.students.length) return html`<${EmptyState} icon="users" title="Chưa có học sinh" text="Mời em vào app ở trang Học sinh trước nhé." />`;

  const sid = studentId || data.students[0].id;
  const st = data.students.find((s) => s.id === sid);
  const mine = (arr) => arr.filter((x) => x.student_id === sid);
  const events = mine(data.events), tasks = mine(data.tasks), requests = mine(data.requests);
  const balance = events.reduce((t, e) => t + e.amount, 0);
  const pending = requests.filter((r) => r.status === 'pending');
  const weekGain = events.filter((e) => e.amount > 0 && Date.now() - new Date(e.created_at) < 7 * 86400e3).reduce((t, e) => t + e.amount, 0);

  const act = async (fn, okMsg) => { try { await fn(); toast(okMsg); reload(); } catch (e) { toast(e.message, 'error'); } };

  return html`
    <div class="page-head">
      <div>
        <h1>Thưởng & thử thách</h1>
        <p class="page-sub">Khen thưởng bằng sao ⭐, đổi quà, và thử thách nhỏ thay cho hình phạt.</p>
      </div>
      <div class="row">
        <button class="btn" onClick=${() => setModal('task')}><${Icon} name="flag" /> Giao thử thách nhỏ</button>
        <button class="btn primary" onClick=${() => setModal('stars')}><${Icon} name="star" /> Thưởng / nhắc nhở</button>
      </div>
    </div>

    ${data.students.length > 1 && html`<div class="chips">
      ${data.students.map((s) => html`<button class=${'chip ' + (s.id === sid ? 'on' : '')} onClick=${() => setStudentId(s.id)}>${s.full_name}</button>`)}
    </div>`}

    <div class="star-hero">
      <div class="row"><${Avatar} name=${st.full_name} /><div><b>${st.full_name}</b><div class="small muted">${st.grade ? 'Lớp ' + st.grade : ''}</div></div></div>
      <div class="star-big">${balance}<span>⭐</span></div>
      <div class="star-mini"><span>+${weekGain} ⭐ tuần này</span><span>${tasks.filter((t) => t.status !== 'confirmed').length} thử thách đang mở</span></div>
    </div>

    <div class="dash-grid">
      <div class="dash-main">
        ${pending.length > 0 && html`
          <section class="card panel highlight">
            <div class="panel-head"><h2><${Icon} name="gift" /> Em xin đổi quà</h2><span class="count-pill">${pending.length}</span></div>
            ${pending.map((r) => html`
              <div class="req-row">
                <span class="reward-ico">${r.rewards.icon}</span>
                <div class="grow"><b>${r.rewards.title}</b><div class="small muted">${r.rewards.cost} ⭐ · xin ${relTime(r.created_at)}</div></div>
                <button class="btn sm" onClick=${() => act(() => rpc('decide_reward', { p_request: r.id, p_approve: false }), 'Đã từ chối yêu cầu.')}>Để sau</button>
                <button class="btn sm primary" onClick=${() => act(() => rpc('decide_reward', { p_request: r.id, p_approve: true }), `Đã duyệt – trừ ${r.rewards.cost} ⭐.`)}>Duyệt</button>
              </div>`)}
          </section>`}

        <section class="card panel">
          <div class="panel-head"><h2><${Icon} name="flag" /> Thử thách nhỏ</h2>
            <button class="btn sm" onClick=${() => setModal('task')}><${Icon} name="plus" size=${15} /> Giao mới</button></div>
          ${tasks.length === 0 ? html`<p class="muted small">Chưa có thử thách nào. Khi em quên bài hay làm chưa tốt, hãy giao một thử thách nhỏ thay vì phạt – em làm xong sẽ được cộng sao.</p>` : tasks.map((t) => html`
            <div class="task-row">
              <div class="grow"><b>${t.title}</b>${t.note && html`<div class="small muted">${t.note}</div>`}
                <div class="small muted">Giao ${relTime(t.created_at)} · thưởng ${t.bonus} ⭐</div></div>
              <span class=${STATUS_TASK[t.status][1]}>${STATUS_TASK[t.status][0]}</span>
              ${t.status === 'done' && html`
                <button class="btn sm" onClick=${() => act(() => rpc('confirm_task', { p_task: t.id, p_ok: false }), 'Đã nhờ em làm lại.')}>Làm lại</button>
                <button class="btn sm primary" onClick=${() => act(() => rpc('confirm_task', { p_task: t.id, p_ok: true }), `Đã xác nhận – em được +${t.bonus} ⭐.`)}>Xác nhận</button>`}
              ${t.status === 'todo' && html`<button class="icon-btn danger" title="Xoá" onClick=${async () => {
                if (await confirmDialog({ title: 'Xoá thử thách?', message: t.title, confirmText: 'Xoá', danger: true })) act(() => rpc('delete_task', { p_task: t.id }), 'Đã xoá thử thách.');
              }}><${Icon} name="trash" /></button>`}
            </div>`)}
        </section>

        <section class="card panel">
          <div class="panel-head"><h2><${Icon} name="clock" /> Lịch sử sao</h2></div>
          ${events.length === 0 ? html`<p class="muted small">Chưa có. Em sẽ tự được sao khi nộp bài đúng hạn và đạt điểm tốt.</p>` : html`
            <ul class="star-log">${events.slice(0, 40).map((e) => html`
              <li><span class=${'star-amt ' + (e.amount > 0 ? 'plus' : 'minus')}>${e.amount > 0 ? '+' : ''}${e.amount}</span>
                <span class="grow">${e.reason}</span><span class="small muted">${relTime(e.created_at)}</span></li>`)}</ul>`}
        </section>
      </div>

      <aside class="dash-side">
        <${RewardShopAdmin} rewards=${data.rewards} onChange=${reload} />
        <section class="card panel">
          <div class="panel-head"><h2><${Icon} name="star" /> Quy tắc sao tự động</h2></div>
          <ul class="rules">${STAR_RULES.map(([a, b]) => html`<li><b>${a}</b><span>${b}</span></li>`)}</ul>
          <p class="small muted">Ngoài ra bạn có thể thưởng thêm bất kỳ lúc nào. Nhắc nhở tối đa −3 ⭐ mỗi lần và không làm số sao âm.</p>
        </section>
      </aside>
    </div>

    ${modal === 'stars' && html`<${GiveStarsModal} students=${data.students} studentId=${sid} onClose=${() => setModal(null)} onDone=${() => { setModal(null); reload(); }} />`}
    ${modal === 'task' && html`<${AssignTaskModal} students=${data.students} studentId=${sid} onClose=${() => setModal(null)} onDone=${() => { setModal(null); reload(); }} />`}`;
}

function RewardShopAdmin({ rewards, onChange }) {
  const [icon, setIcon] = useState('🎁');
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState(10);
  const add = async (i, t, c) => {
    try { await q(sb.from('rewards').insert({ icon: i, title: t, cost: Number(c) })); toast('Đã thêm phần thưởng.'); setTitle(''); onChange(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const toggle = async (r) => { try { await q(sb.from('rewards').update({ active: !r.active }).eq('id', r.id)); onChange(); } catch (e) { toast(e.message, 'error'); } };
  const remove = async (r) => {
    if (!(await confirmDialog({ title: 'Xoá phần thưởng?', message: `${r.icon} ${r.title}`, confirmText: 'Xoá', danger: true }))) return;
    try { await q(sb.from('rewards').delete().eq('id', r.id)); toast('Đã xoá.'); onChange(); } catch (e) { toast(e.message, 'error'); }
  };
  const missing = REWARD_PRESETS.filter(([, t]) => !rewards.some((r) => r.title === t));
  return html`
    <section class="card panel">
      <div class="panel-head"><h2><${Icon} name="gift" /> Cửa hàng phần thưởng</h2></div>
      ${rewards.length === 0 && html`<p class="small muted">Thêm vài phần thưởng để em có mục tiêu tích sao.</p>`}
      ${rewards.map((r) => html`
        <div class=${'shop-row ' + (r.active ? '' : 'off')}>
          <span class="reward-ico">${r.icon}</span>
          <div class="grow"><b>${r.title}</b><div class="small muted">${r.cost} ⭐${r.active ? '' : ' · đang ẩn'}</div></div>
          <button class="icon-btn" title=${r.active ? 'Ẩn' : 'Hiện'} onClick=${() => toggle(r)}><${Icon} name=${r.active ? 'eye' : 'eyeOff'} /></button>
          <button class="icon-btn danger" title="Xoá" onClick=${() => remove(r)}><${Icon} name="trash" /></button>
        </div>`)}
      <div class="add-reward">
        <input class="emoji-in" value=${icon} maxlength="4" onInput=${(e) => setIcon(e.target.value)} aria-label="Biểu tượng" />
        <input value=${title} placeholder="Tên phần thưởng" onInput=${(e) => setTitle(e.target.value)} />
        <input type="number" class="num" min="1" max="1000" value=${cost} onInput=${(e) => setCost(e.target.value)} aria-label="Số sao" />
        <button class="btn primary" disabled=${!title.trim()} onClick=${() => add(icon || '🎁', title.trim(), cost)}><${Icon} name="plus" /></button>
      </div>
      ${missing.length > 0 && html`<div class="preset-chips"><span class="small muted">Gợi ý nhanh:</span>
        ${missing.map(([i, t, c]) => html`<button class="chip" onClick=${() => add(i, t, c)}>${i} ${t} · ${c}⭐</button>`)}</div>`}
    </section>`;
}

export function GiveStarsModal({ students, studentId, onClose, onDone }) {
  const [sid, setSid] = useState(studentId || (students[0] || {}).id);
  const [mode, setMode] = useState('praise');
  const [amount, setAmount] = useState(2);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amounts = mode === 'praise' ? [1, 2, 3, 5] : [1, 2, 3];
  async function save() {
    setBusy(true); setErr('');
    try {
      await rpc('give_stars', { p_student: sid, p_amount: mode === 'praise' ? amount : -amount, p_reason: reason });
      toast(mode === 'praise' ? `Đã thưởng +${amount} ⭐` : `Đã nhắc nhở −${amount} ⭐`);
      onDone();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return html`
    <${Modal} title="Thưởng / nhắc nhở" onClose=${onClose}
      footer=${html`<button class="btn" onClick=${onClose}>Huỷ</button>
        <button class=${'btn ' + (mode === 'praise' ? 'primary' : 'danger')} disabled=${busy || !reason.trim()} onClick=${save}>
          ${mode === 'praise' ? `Thưởng +${amount} ⭐` : `Nhắc nhở −${amount} ⭐`}</button>`}>
      <div class="stack">
        ${students.length > 1 && html`<label>Học sinh<select value=${sid} onChange=${(e) => setSid(e.target.value)}>
          ${students.map((s) => html`<option value=${s.id}>${s.full_name}</option>`)}</select></label>`}
        <div class="segmented">
          <button class=${mode === 'praise' ? 'active' : ''} onClick=${() => { setMode('praise'); setAmount(2); setReason(''); }}>⭐ Khen thưởng</button>
          <button class=${mode === 'remind' ? 'active' : ''} onClick=${() => { setMode('remind'); setAmount(1); setReason(''); }}>🌱 Nhắc nhở nhẹ</button>
        </div>
        <div class="amount-pick">${amounts.map((a) => html`
          <button class=${'amount ' + (amount === a ? 'on' : '') + (mode === 'remind' ? ' remind' : '')} onClick=${() => setAmount(a)}>${mode === 'praise' ? '+' : '−'}${a} ⭐</button>`)}</div>
        <label>Lý do (em sẽ thấy)
          <input value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder=${mode === 'praise' ? 'VD: Chăm chỉ làm bài' : 'VD: Quên làm bài'} />
        </label>
        <div class="preset-chips">${(mode === 'praise' ? PRAISE_PRESETS : REMIND_PRESETS).map((p) => html`<button class="chip" onClick=${() => setReason(p)}>${p}</button>`)}</div>
        ${mode === 'remind' && html`<p class="small muted">💡 Thay vì trừ sao, bạn có thể giao một <b>thử thách nhỏ</b> – em làm xong còn được cộng sao, tích cực hơn.</p>`}
        <${ErrorBox} msg=${err} />
      </div>
    </${Modal}>`;
}

export function AssignTaskModal({ students, studentId, onClose, onDone, suggestion = '' }) {
  const [sid, setSid] = useState(studentId || (students[0] || {}).id);
  const [title, setTitle] = useState(suggestion);
  const [note, setNote] = useState('');
  const [bonus, setBonus] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setBusy(true); setErr('');
    try { await rpc('assign_task', { p_student: sid, p_title: title, p_note: note, p_bonus: bonus }); toast('Đã giao thử thách nhỏ.'); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return html`
    <${Modal} title="Giao thử thách nhỏ" onClose=${onClose}
      footer=${html`<button class="btn" onClick=${onClose}>Huỷ</button>
        <button class="btn primary" disabled=${busy || !title.trim()} onClick=${save}>Giao thử thách</button>`}>
      <div class="stack">
        <p class="small muted">Thử thách nhỏ thay cho hình phạt: nhẹ nhàng, có ích, làm xong em được cộng sao.</p>
        ${students.length > 1 && html`<label>Học sinh<select value=${sid} onChange=${(e) => setSid(e.target.value)}>
          ${students.map((s) => html`<option value=${s.id}>${s.full_name}</option>`)}</select></label>`}
        <div class="preset-list">${TASK_PRESETS.map((p) => html`
          <button class=${'preset ' + (title === p ? 'on' : '')} onClick=${() => setTitle(p)}>${p}</button>`)}</div>
        <label>Thử thách <input value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="Hoặc tự viết thử thách" /></label>
        <label>Ghi chú (không bắt buộc) <input value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="VD: Làm trước 8 giờ tối nay" /></label>
        <label>Làm xong được thưởng
          <div class="amount-pick">${[0, 1, 2, 3].map((b) => html`<button class=${'amount ' + (bonus === b ? 'on' : '')} onClick=${() => setBonus(b)}>${b ? '+' + b + ' ⭐' : 'Không'}</button>`)}</div>
        </label>
        <${ErrorBox} msg=${err} />
      </div>
    </${Modal}>`;
}

// =====================================================================
//  Học sinh
// =====================================================================
export function StudentStars({ profile }) {
  const [data, err, reload] = useLoad(async () => {
    const [events, rewards, requests, tasks] = await Promise.all([
      q(sb.from('star_events').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }).limit(100)),
      q(sb.from('rewards').select('*').eq('active', true).order('cost')),
      q(sb.from('reward_requests').select('*, rewards(title, icon, cost)').eq('student_id', profile.id).order('created_at', { ascending: false }).limit(20)),
      q(sb.from('tasks').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }).limit(30)),
    ]);
    return { events, rewards, requests, tasks };
  });
  if (err) return html`<${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;
  const balance = data.events.reduce((t, e) => t + e.amount, 0);
  const pendingIds = new Set(data.requests.filter((r) => r.status === 'pending').map((r) => r.reward_id));
  const openTasks = data.tasks.filter((t) => t.status !== 'confirmed');
  const next = data.rewards.find((r) => r.cost > balance);

  const act = async (fn, okMsg) => { try { await fn(); toast(okMsg); reload(); } catch (e) { toast(e.message, 'error'); } };

  return html`
    <section class="hero-card stars">
      <div class="hero-text">
        <p class="eyebrow light">Sao của em</p>
        <h1>${balance} ⭐</h1>
        <p>${next ? `Còn ${next.cost - balance} ⭐ nữa là đổi được ${next.icon} ${next.title}!` : data.rewards.length ? 'Em đủ sao đổi mọi phần thưởng rồi! 🎉' : 'Làm bài đúng hạn và đạt điểm tốt để tích sao nhé!'}</p>
      </div>
      <div class="hero-mini">
        <div><b>${openTasks.length}</b><span>thử thách đang mở</span></div>
        <div><b>${data.requests.filter((r) => r.status === 'approved').length}</b><span>quà đã đổi</span></div>
      </div>
    </section>

    ${openTasks.length > 0 && html`
      <div class="section-bar"><h2>Thử thách nhỏ của em <span class="count-pill">${openTasks.length}</span></h2></div>
      <div class="task-grid">${openTasks.map((t) => html`
        <div class="task-card tone-amber challenge">
          <div class="task-top"><span class="subject-chip tone-amber"><i></i>Thử thách</span><span class=${STATUS_TASK[t.status][1]}>${t.status === 'todo' ? 'Cần làm' : 'Chờ anh xác nhận'}</span></div>
          <div class="task-title">${t.title}</div>
          ${t.note && html`<div class="small muted">${t.note}</div>`}
          <div class="task-foot"><span class="small">Làm xong: <b>+${t.bonus} ⭐</b></span>
            ${t.status === 'todo' && html`<button class="btn sm primary" onClick=${() => act(() => rpc('mark_task_done', { p_task: t.id }), 'Giỏi lắm! Đã báo anh xác nhận.')}><${Icon} name="check" size=${15} /> Em đã làm xong</button>`}
          </div>
        </div>`)}</div>`}

    <div class="section-bar"><h2>Đổi quà</h2></div>
    ${data.rewards.length === 0 ? html`<${EmptyState} icon="gift" title="Chưa có phần thưởng" text="Nhờ anh thêm phần thưởng trong app nhé." />` : html`
      <div class="shop-grid">${data.rewards.map((r) => {
        const can = balance >= r.cost, waiting = pendingIds.has(r.id);
        return html`
          <div class=${'shop-card ' + (can ? 'can' : '')}>
            <div class="shop-ico">${r.icon}</div>
            <b>${r.title}</b>
            <div class="shop-cost">${r.cost} ⭐</div>
            <div class="shop-bar"><i style=${`width:${Math.min(100, (balance / r.cost) * 100)}%`}></i></div>
            <button class="btn sm full ${can && !waiting ? 'primary' : ''}" disabled=${!can || waiting}
              onClick=${() => act(() => rpc('request_reward', { p_reward: r.id }), 'Đã gửi yêu cầu – chờ anh duyệt nhé!')}>
              ${waiting ? 'Đang chờ duyệt' : can ? 'Đổi quà' : `Còn thiếu ${r.cost - balance} ⭐`}</button>
          </div>`;
      })}</div>`}

    <div class="dash-grid">
      <section class="card panel">
        <div class="panel-head"><h2>Lịch sử sao</h2></div>
        ${data.events.length === 0 ? html`<p class="muted small">Chưa có sao nào. Nộp bài đúng hạn là có sao đầu tiên!</p>` : html`
          <ul class="star-log">${data.events.map((e) => html`
            <li><span class=${'star-amt ' + (e.amount > 0 ? 'plus' : 'minus')}>${e.amount > 0 ? '+' : ''}${e.amount}</span>
              <span class="grow">${e.reason}</span><span class="small muted">${relTime(e.created_at)}</span></li>`)}</ul>`}
      </section>
      <section class="card panel">
        <div class="panel-head"><h2>Cách nhận sao</h2></div>
        <ul class="rules">${STAR_RULES.map(([a, b]) => html`<li><b>${a}</b><span>${b}</span></li>`)}</ul>
        <p class="small muted">Anh còn có thể thưởng thêm khi em chăm chỉ, tự giác! 💪</p>
      </section>
    </div>`;
}
