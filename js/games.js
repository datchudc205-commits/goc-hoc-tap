// GÓC TRÒ CHƠI – vừa chơi vừa ôn bài. 6 trò, nội dung: Toán 6 tự sinh, từ vựng Tiếng Anh 6, ôn bài đã làm, AI theo bài học.
import { html, useState, useEffect, useRef, useMemo } from './lib.js';
import { sb, q, rpc, ai } from './db.js';
import { useLoad, Loading, ErrorBox, Icon, toast, go, relTime, LessonPicker, plainMath } from './ui.js';
import { MATH_TOPICS, EN_UNITS, mathItems, englishItems, reviewItems, shuffle, statement, canScramble, rand } from './gamedata.js';

export const GAMES = [
  { id: 'bong-bay', name: 'Bắn bóng bay', icon: '🎈', desc: 'Chạm đúng quả bóng mang đáp án trước khi nó bay mất.', min: 4 },
  { id: 'lat-the', name: 'Lật thẻ tìm cặp', icon: '🃏', desc: 'Lật 2 thẻ, ghép câu hỏi với đáp án đúng.', min: 4 },
  { id: 'nhanh-tay', name: 'Nhanh tay 60 giây', icon: '⚡', desc: 'Trả lời càng nhiều càng tốt, đúng liên tiếp được nhân điểm.', min: 4 },
  { id: 'dung-sai', name: 'Đúng hay Sai', icon: '✅', desc: 'Phép tính / câu này đúng hay sai? Quyết định thật nhanh!', min: 4 },
  { id: 'xep-chu', name: 'Xếp chữ', icon: '🔤', desc: 'Xếp các chữ cái thành từ tiếng Anh đúng.', min: 4, needWord: true },
  { id: 'dua-xe', name: 'Đua về đích', icon: '🏁', desc: 'Trả lời đúng để xe chạy, về đích trước rô-bốt!', min: 4 },
];
const gameById = (id) => GAMES.find((g) => g.id === id);

// ---------------------------------------------------------------------
//  Âm thanh nhỏ (không cần file), có nút tắt
// ---------------------------------------------------------------------
let actx;
function sfx(kind) {
  if (localStorage.getItem('game-mute') === '1') return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { ok: [660, 880], bad: [220, 170], win: [523, 659, 784, 1046], pop: [900] }[kind] || [440];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = kind === 'bad' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, actx.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.12, actx.currentTime + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + i * 0.09 + 0.18);
      o.connect(g).connect(actx.destination); o.start(actx.currentTime + i * 0.09); o.stop(actx.currentTime + i * 0.09 + 0.2);
    });
  } catch { /* trình duyệt không hỗ trợ âm thanh */ }
}

function useTicker(running, ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [running]);
  return now;
}
const optionsOf = (it) => shuffle([it.a, ...it.wrong.slice(0, 3)]);
const shortCls = (s) => (String(s).length > 28 ? 'g-xs' : String(s).length > 14 ? 'g-sm' : '');

function Hud({ items }) {
  return html`<div class="g-hud">${items.filter(Boolean).map(([label, val, cls]) => html`<div class=${'g-hud-i ' + (cls || '')}><span>${label}</span><b>${val}</b></div>`)}</div>`;
}

// ---------------------------------------------------------------------
//  1. BẮN BÓNG BAY
// ---------------------------------------------------------------------
function BalloonGame({ items, onDone }) {
  const rounds = Math.min(10, items.length);
  const [idx, setIdx] = useState(0);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [state, setState] = useState({}); // option → 'pop' | 'bad'
  const [reveal, setReveal] = useState(false);
  const stats = useRef({ correct: 0, wrong: [], start: Date.now(), score: 0 });
  const it = items[idx % items.length];
  const opts = useMemo(() => optionsOf(it), [idx]);
  const speed = Math.max(5, 9 - idx * 0.4);
  const roundStart = useRef(Date.now());
  const lock = useRef(false);

  function next(livesLeft) {
    setTimeout(() => {
      if (idx + 1 >= rounds || livesLeft <= 0) {
        onDone({ score: stats.current.score, correct: stats.current.correct, total: Math.min(idx + 1, rounds), wrong: stats.current.wrong, seconds: (Date.now() - stats.current.start) / 1000 });
        return;
      }
      setIdx(idx + 1); setState({}); setReveal(false); lock.current = false; roundStart.current = Date.now();
    }, 750);
  }
  function tap(o) {
    if (lock.current || state[o]) return;
    if (o === it.a) {
      lock.current = true; sfx('pop');
      const bonus = Math.max(0, Math.round(10 - (Date.now() - roundStart.current) / 1000));
      stats.current.score += 10 + bonus; setScore(stats.current.score); stats.current.correct++;
      setState((s) => ({ ...s, [o]: 'pop' })); next(lives);
    } else {
      sfx('bad'); setState((s) => ({ ...s, [o]: 'bad' }));
      if (!stats.current.wrong.includes(it)) stats.current.wrong.push(it);
      const l = lives - 1; setLives(l);
      if (l <= 0) { lock.current = true; setReveal(true); next(0); }
    }
  }
  function escaped(o) {
    if (o !== it.a || lock.current) return;
    lock.current = true; sfx('bad'); setReveal(true);
    if (!stats.current.wrong.includes(it)) stats.current.wrong.push(it);
    const l = lives - 1; setLives(l); next(l);
  }
  return html`
    <${Hud} items=${[['Câu', `${idx + 1}/${rounds}`], ['Mạng', '❤️'.repeat(lives) + '🤍'.repeat(3 - lives)], ['Điểm', score, 'hl']]} />
    <div class="g-question">${plainMath(it.q)}</div>
    <div class="balloon-sky" key=${idx}>
      ${opts.map((o, i) => html`
        <button class=${'balloon c' + (i % 4) + ' ' + (state[o] || '') + (reveal && o === it.a ? ' reveal' : '')}
          style=${`left:${6 + i * 23.5}%;--rise:${(speed + i * 0.35).toFixed(2)}s;animation-delay:${i * 0.12}s`}
          onClick=${() => tap(o)} onAnimationEnd=${(e) => e.animationName === 'rise' && escaped(o)}>
          <span class=${shortCls(o)}>${plainMath(o)}</span>
        </button>`)}
    </div>`;
}

// ---------------------------------------------------------------------
//  2. LẬT THẺ TÌM CẶP
// ---------------------------------------------------------------------
function MemoryGame({ items, onDone }) {
  const pairs = Math.min(8, items.length);
  const cards = useMemo(() => shuffle(items.slice(0, pairs).flatMap((it, pid) => [
    { key: pid + 'q', pid, side: 'q', text: it.q }, { key: pid + 'a', pid, side: 'a', text: it.a }])), []);
  const [open, setOpen] = useState([]);
  const [done, setDone] = useState([]);
  const [misses, setMisses] = useState(0);
  const start = useRef(Date.now());
  const now = useTicker(done.length < pairs, 1000);

  function flip(c) {
    if (open.length === 2 || open.includes(c.key) || done.includes(c.pid)) return;
    const o = [...open, c.key];
    setOpen(o);
    if (o.length < 2) return;
    const [a, b] = o.map((k) => cards.find((x) => x.key === k));
    if (a.pid === b.pid) {
      sfx('ok');
      const d = [...done, a.pid]; setDone(d); setOpen([]);
      if (d.length === pairs) {
        const secs = (Date.now() - start.current) / 1000;
        // lật sai khoảng bằng số cặp là bình thường (chưa biết thẻ nào ở đâu); sai nhiều hơn mới trừ
        setTimeout(() => onDone({ score: Math.max(10, 200 - misses * 8 - Math.round(secs)), correct: Math.max(0, pairs - Math.max(0, misses - pairs)), total: pairs,
          wrong: [], seconds: secs }), 600);
      }
    } else {
      sfx('bad'); setMisses((m) => m + 1);
      setTimeout(() => setOpen([]), 850);
    }
  }
  return html`
    <${Hud} items=${[['Đã ghép', `${done.length}/${pairs}`], ['Lật sai', misses], ['Thời gian', Math.round((now - start.current) / 1000) + 's', 'hl']]} />
    <p class="g-tip">Ghép mỗi <b>câu hỏi</b> (thẻ tím ❓) với <b>đáp án</b> (thẻ cam 💡) của nó.</p>
    <div class="mem-grid">
      ${cards.map((c) => { const shown = open.includes(c.key) || done.includes(c.pid); return html`
        <button class=${'mem-card ' + c.side + (shown ? ' shown' : '') + (done.includes(c.pid) ? ' done' : '')} onClick=${() => flip(c)}>
          <span class="mem-back">${c.side === 'q' ? '❓' : '💡'}</span>
          <span class=${'mem-front ' + shortCls(c.text)}>${plainMath(c.text)}</span>
        </button>`; })}
    </div>`;
}

// ---------------------------------------------------------------------
//  3. NHANH TAY 60 GIÂY
// ---------------------------------------------------------------------
function SpeedGame({ items, onDone, seconds = 60 }) {
  const [pos, setPos] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState('');
  const st = useRef({ correct: 0, total: 0, wrong: [], start: Date.now(), ended: false });
  const now = useTicker(true, 200);
  const left = Math.max(0, seconds - (now - st.current.start) / 1000);
  const it = items[pos % items.length];
  const opts = useMemo(() => optionsOf(it), [pos]);
  const mult = Math.min(3, 1 + Math.floor(streak / 3));

  useEffect(() => {
    if (left <= 0 && !st.current.ended) {
      st.current.ended = true;
      onDone({ score, correct: st.current.correct, total: st.current.total, wrong: st.current.wrong, seconds });
    }
  }, [left <= 0]);
  function answer(o) {
    if (st.current.ended) return;
    st.current.total++;
    if (o === it.a) { sfx('ok'); st.current.correct++; setScore((s) => s + 10 * mult); setStreak((s) => s + 1); setFlash('ok'); }
    else { sfx('bad'); setStreak(0); setFlash('bad'); if (!st.current.wrong.includes(it)) st.current.wrong.push(it); }
    setTimeout(() => setFlash(''), 250);
    setPos((p) => p + 1);
  }
  useEffect(() => {
    const h = (e) => { const n = Number(e.key); if (n >= 1 && n <= opts.length) answer(opts[n - 1]); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  return html`
    <${Hud} items=${[['Còn lại', Math.ceil(left) + 's', left < 10 ? 'danger' : ''], ['Chuỗi đúng', streak + (mult > 1 ? ` (x${mult})` : '')], ['Điểm', score, 'hl']]} />
    <div class="g-timebar"><i style=${`width:${(left / seconds) * 100}%`}></i></div>
    <div class=${'g-question big ' + flash}>${plainMath(it.q)}</div>
    <div class="g-options">
      ${opts.map((o, i) => html`<button class="g-opt" onClick=${() => answer(o)}><kbd>${i + 1}</kbd><span class=${shortCls(o)}>${plainMath(o)}</span></button>`)}
    </div>`;
}

// ---------------------------------------------------------------------
//  4. ĐÚNG HAY SAI
// ---------------------------------------------------------------------
function TrueFalseGame({ items, onDone, seconds = 45 }) {
  const [pos, setPos] = useState(0);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState('');
  const st = useRef({ correct: 0, total: 0, wrong: [], start: Date.now(), ended: false });
  const now = useTicker(true, 200);
  const left = Math.max(0, seconds - (now - st.current.start) / 1000);
  const it = items[pos % items.length];
  const shown = useMemo(() => (Math.random() < 0.5 ? { v: it.a, truth: true } : { v: it.wrong[rand(0, it.wrong.length - 1)], truth: false }), [pos]);

  useEffect(() => {
    if (left <= 0 && !st.current.ended) {
      st.current.ended = true;
      onDone({ score, correct: st.current.correct, total: st.current.total, wrong: st.current.wrong, seconds });
    }
  }, [left <= 0]);
  function answer(says) {
    if (st.current.ended) return;
    st.current.total++;
    if (says === shown.truth) { sfx('ok'); st.current.correct++; setScore((s) => s + 10); setFlash('ok'); }
    else { sfx('bad'); setFlash('bad'); if (!st.current.wrong.includes(it)) st.current.wrong.push(it); }
    setTimeout(() => { setFlash(''); setPos((p) => p + 1); }, 280);
  }
  useEffect(() => {
    const h = (e) => { if (e.key === 'ArrowLeft' || e.key === 'd') answer(true); if (e.key === 'ArrowRight' || e.key === 's') answer(false); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  return html`
    <${Hud} items=${[['Còn lại', Math.ceil(left) + 's', left < 10 ? 'danger' : ''], ['Đúng', st.current.correct], ['Điểm', score, 'hl']]} />
    <div class="g-timebar"><i style=${`width:${(left / seconds) * 100}%`}></i></div>
    <div class=${'g-question big tf ' + flash}>${plainMath(statement(it, shown.v))}</div>
    <div class="tf-btns">
      <button class="tf-yes" onClick=${() => answer(true)}>✔ Đúng <kbd>←</kbd></button>
      <button class="tf-no" onClick=${() => answer(false)}>✘ Sai <kbd>→</kbd></button>
    </div>`;
}

// ---------------------------------------------------------------------
//  5. XẾP CHỮ (từ tiếng Anh)
// ---------------------------------------------------------------------
function ScrambleGame({ items, onDone }) {
  const words = useMemo(() => items.filter(canScramble).slice(0, 8), []);
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState([]); // chỉ số ô chữ đã chọn
  const [score, setScore] = useState(0);
  const [shake, setShake] = useState(false);
  const [solved, setSolved] = useState(false);
  const st = useRef({ correct: 0, wrong: [], start: Date.now(), hinted: false, score: 0 });
  const it = words[pos];
  const target = it.word.toUpperCase();
  const tiles = useMemo(() => {
    let t; do { t = shuffle(target.split('')); } while (t.join('') === target && target.length > 2);
    return t;
  }, [pos]);
  const guess = picked.map((i) => tiles[i]).join('');
  // thứ tự ô chữ đúng (để gợi ý)
  const sol = useMemo(() => {
    const used = new Set();
    return target.split('').map((ch) => { const j = tiles.findIndex((t, k) => t === ch && !used.has(k)); used.add(j); return j; });
  }, [pos]);

  function finishWord(ok) {
    if (ok) { sfx('ok'); st.current.correct += st.current.hinted ? 0 : 1; st.current.score += st.current.hinted ? 5 : 15; setScore(st.current.score); }
    if ((!ok || st.current.hinted) && !st.current.wrong.includes(it)) st.current.wrong.push(it);
    setSolved(true);
    setTimeout(() => {
      if (pos + 1 >= words.length) {
        onDone({ score: st.current.score, correct: st.current.correct, total: words.length, wrong: st.current.wrong, seconds: (Date.now() - st.current.start) / 1000 });
        return;
      }
      setPos(pos + 1); setPicked([]); setSolved(false); st.current.hinted = false;
    }, 900);
  }
  function tap(i) {
    if (solved || picked.includes(i)) return;
    const p = [...picked, i]; setPicked(p);
    if (p.length === target.length) {
      if (p.map((k) => tiles[k]).join('') === target) finishWord(true);
      else { sfx('bad'); setShake(true); setTimeout(() => { setShake(false); setPicked([]); }, 500); }
    }
  }
  function hint() {
    // giữ phần em xếp đúng, đặt thêm 1 chữ cái đúng tiếp theo
    st.current.hinted = true;
    let k = 0;
    while (k < picked.length && tiles[picked[k]] === target[k]) k++;
    const p = sol.slice(0, k + 1);
    setPicked(p);
    if (p.length === target.length) finishWord(true);
  }
  return html`
    <${Hud} items=${[['Từ', `${pos + 1}/${words.length}`], ['Đúng', st.current.correct], ['Điểm', score, 'hl']]} />
    <div class="g-question">Nghĩa: <b>${it.a}</b></div>
    <div class=${'scr-slots ' + (shake ? 'shake' : '') + (solved ? ' solved' : '')}>
      ${target.split('').map((_, k) => html`<span class="scr-slot" onClick=${() => !solved && setPicked(picked.slice(0, k))}>${solved ? target[k] : guess[k] || ''}</span>`)}
    </div>
    <div class="scr-tiles">
      ${tiles.map((ch, i) => html`<button class=${'scr-tile ' + (picked.includes(i) ? 'used' : '')} onClick=${() => tap(i)}>${ch}</button>`)}
    </div>
    <div class="row center-row">
      <button class="btn sm" disabled=${solved} onClick=${() => setPicked(picked.slice(0, -1))}>⌫ Xoá</button>
      <button class="btn sm" disabled=${solved} onClick=${hint}>💡 Gợi ý 1 chữ</button>
      <button class="btn sm ghost" disabled=${solved} onClick=${() => { setPicked([]); finishWord(false); }}>Bỏ qua</button>
    </div>`;
}

// ---------------------------------------------------------------------
//  6. ĐUA VỀ ĐÍCH
// ---------------------------------------------------------------------
const ROBOT = { de: { label: 'Dễ', ms: 7000 }, vua: { label: 'Vừa', ms: 5000 }, kho: { label: 'Khó', ms: 3500 } };
function RaceGame({ items, onDone }) {
  const GOAL = 10;
  const [level, setLevel] = useState('');
  const [me, setMe] = useState(0);
  const [pos, setPos] = useState(0);
  const [flash, setFlash] = useState('');
  const st = useRef({ correct: 0, total: 0, wrong: [], start: 0, ended: false });
  const now = useTicker(!!level, 200);
  const robot = level ? Math.min(GOAL, Math.floor((now - st.current.start) / ROBOT[level].ms)) : 0;
  const it = items[pos % items.length];
  const opts = useMemo(() => optionsOf(it), [pos]);

  function end(win) {
    if (st.current.ended) return;
    st.current.ended = true; sfx(win ? 'win' : 'bad');
    setTimeout(() => onDone({ score: st.current.correct * 10 + (win ? 50 : 0), correct: st.current.correct, total: st.current.total,
      wrong: st.current.wrong, seconds: (Date.now() - st.current.start) / 1000, note: win ? '🏆 Em về đích trước rô-bốt!' : '🤖 Rô-bốt về trước rồi, thử lại nhé!' }), 700);
  }
  useEffect(() => { if (level && robot >= GOAL && me < GOAL) end(false); }, [robot]);
  function answer(o) {
    if (st.current.ended) return;
    st.current.total++;
    if (o === it.a) { sfx('ok'); st.current.correct++; const m = me + 1; setMe(m); setFlash('ok'); if (m >= GOAL) end(true); }
    else { sfx('bad'); setFlash('bad'); if (!st.current.wrong.includes(it)) st.current.wrong.push(it); }
    setTimeout(() => setFlash(''), 250);
    setPos((p) => p + 1);
  }
  if (!level) return html`
    <div class="card center stack race-pick">
      <h3>Chọn tốc độ của rô-bốt 🤖</h3>
      <div class="row center-row">
        ${Object.entries(ROBOT).map(([k, v]) => html`<button class="btn" onClick=${() => { st.current.start = Date.now(); setLevel(k); }}>${v.label} <span class="muted small">(${v.ms / 1000}s/bước)</span></button>`)}
      </div>
    </div>`;
  return html`
    <div class="race-track">
      <div class="lane"><span class="lane-name">Em</span><div class="road"><span class="car" style=${`left:calc(${(me / GOAL) * 100}% - ${(me / GOAL) * 34}px)`}>🏎️</span></div><span class="flag">🏁</span></div>
      <div class="lane"><span class="lane-name">Rô-bốt</span><div class="road"><span class="car" style=${`left:calc(${(robot / GOAL) * 100}% - ${(robot / GOAL) * 34}px)`}>🤖</span></div><span class="flag">🏁</span></div>
    </div>
    <div class=${'g-question big ' + flash}>${plainMath(it.q)}</div>
    <div class="g-options">
      ${opts.map((o, i) => html`<button class="g-opt" onClick=${() => answer(o)}><kbd>${i + 1}</kbd><span class=${shortCls(o)}>${plainMath(o)}</span></button>`)}
    </div>`;
}

const PLAY = { 'bong-bay': BalloonGame, 'lat-the': MemoryGame, 'nhanh-tay': SpeedGame, 'dung-sai': TrueFalseGame, 'xep-chu': ScrambleGame, 'dua-xe': RaceGame };

// ---------------------------------------------------------------------
//  Khung chơi + màn hình kết quả
// ---------------------------------------------------------------------
function GamePlay({ game, pack, profile, onExit }) {
  const [round, setRound] = useState(0);
  const [res, setRes] = useState(null);
  const [stars, setStars] = useState(null); // null: chưa lưu
  const [mute, setMute] = useState(localStorage.getItem('game-mute') === '1');
  const items = useMemo(() => (pack.regen ? pack.regen() : shuffle(pack.items)), [round]);
  const G = PLAY[game.id];

  async function done(r) {
    const pct = r.total ? r.correct / r.total : 0;
    if (pct >= 0.8 && r.total >= 4) sfx('win');
    setRes({ ...r, score: Math.round(r.score) });
    if (profile.role !== 'student') { setStars(-1); return; }
    try {
      const s = await rpc('finish_game', { p_game: game.name, p_pack: pack.label, p_score: Math.round(r.score), p_correct: r.correct, p_total: r.total, p_seconds: Math.round(r.seconds) });
      setStars(s);
    } catch (e) { setStars(0); toast(e.message, 'error'); }
  }
  const again = () => { setRes(null); setStars(null); setRound((x) => x + 1); };

  return html`
    <div class="g-top">
      <button class="btn sm ghost" onClick=${onExit}>← Trò khác</button>
      <div class="g-title"><span>${game.icon}</span> ${game.name}<small>${pack.label}</small></div>
      <button class="btn sm ghost" title=${mute ? 'Bật âm thanh' : 'Tắt âm thanh'}
        onClick=${() => { localStorage.setItem('game-mute', mute ? '0' : '1'); setMute(!mute); }}>${mute ? '🔇' : '🔊'}</button>
    </div>
    ${res ? html`<${ResultCard} res=${res} stars=${stars} onAgain=${again} onExit=${onExit} profile=${profile} />`
      : html`<div class="g-stage" key=${round}><${G} items=${items} onDone=${done} /></div>`}`;
}

function ResultCard({ res, stars, onAgain, onExit, profile }) {
  const pct = res.total ? Math.round((res.correct / res.total) * 100) : 0;
  const face = pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : pct >= 50 ? '👍' : '💪';
  const msg = pct >= 90 ? 'Xuất sắc!' : pct >= 70 ? 'Giỏi lắm!' : pct >= 50 ? 'Khá tốt, cố thêm chút nữa!' : 'Không sao, chơi lại để nhớ bài hơn nhé!';
  return html`
    <div class="card g-result">
      <div class="g-face">${face}</div>
      <h2>${msg}</h2>
      ${res.note && html`<p class="g-note">${res.note}</p>`}
      <div class="g-stats">
        <div><b>${res.score}</b><span>điểm</span></div>
        <div><b>${res.correct}/${res.total}</b><span>câu đúng</span></div>
        <div><b>${Math.round(res.seconds)}s</b><span>thời gian</span></div>
      </div>
      ${profile.role === 'student' && (stars == null ? html`<p class="small muted">Đang lưu kết quả…</p>`
        : stars > 0 ? html`<div class="g-star">+${stars} ⭐ Em được thưởng sao!</div>`
        : html`<p class="small muted">Đúng từ 80% (ít nhất 8 câu) để được ⭐ – mỗi ngày có giới hạn số sao từ trò chơi.</p>`)}
      ${res.wrong.length > 0 && html`
        <div class="g-review">
          <div class="card-title">📘 Ôn lại câu chưa đúng</div>
          ${res.wrong.slice(0, 10).map((w) => html`<div class="g-review-row"><span>${plainMath(w.q)}</span><b>${plainMath(w.a)}</b></div>`)}
        </div>`}
      <div class="row center-row">
        <button class="btn" onClick=${onExit}>Chọn trò khác</button>
        <button class="btn primary" onClick=${onAgain}>🔁 Chơi lại</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------
//  GÓC TRÒ CHƠI (trang chính)
// ---------------------------------------------------------------------
const SOURCES = [
  { id: 'toan', label: '🧮 Toán 6' },
  { id: 'anh', label: '🌍 Từ vựng Tiếng Anh' },
  { id: 'on', label: '📚 Ôn bài đã làm' },
  { id: 'ai', label: '✨ AI theo bài học' },
];

export function GameHub({ profile }) {
  const isStudent = profile.role === 'student';
  const preset = useMemo(() => { const p = sessionStorage.getItem('game-pack'); sessionStorage.removeItem('game-pack'); return p; }, []);
  const [source, setSource] = useState(preset ? 'on' : 'toan');
  const [topics, setTopics] = useState(['tinh']);
  const [units, setUnits] = useState(['u1']);
  const [reviewId, setReviewId] = useState(preset ? preset.replace('bai:', '') : '');
  const [aiPick, setAiPick] = useState({ subject: 'Khoa học tự nhiên', lesson: '' });
  const [aiPack, setAiPack] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [playing, setPlaying] = useState(null); // { game, pack }

  const [data, err, reload] = useLoad(async () => {
    const sid = isStudent ? profile.id : null;
    const [status, sessions, done] = await Promise.all([
      isStudent ? rpc('game_status') : Promise.resolve(null),
      isStudent ? q(sb.from('game_sessions').select('*').eq('student_id', sid).order('created_at', { ascending: false }).limit(8)) : Promise.resolve([]),
      isStudent ? q(sb.from('submissions').select('assignment_id, assignments(id, title, subject)').eq('student_id', sid).eq('status', 'returned').order('returned_at', { ascending: false }).limit(30))
        : q(sb.from('assignments').select('id, title, subject').eq('teacher_id', profile.id).order('created_at', { ascending: false }).limit(30)),
    ]);
    const assignments = isStudent ? done.map((d) => d.assignments).filter(Boolean) : done;
    return { status, sessions, assignments };
  });
  const [review] = useLoad(async () => {
    if (source !== 'on') return null;
    const ids = reviewId ? [reviewId] : (data ? data.assignments.map((a) => a.id) : []);
    if (!ids.length) return [];
    const qs = await q(sb.from('questions').select('id, type, prompt, options, question_keys(accepted)').in('assignment_id', ids).in('type', ['mcq', 'short']));
    return reviewItems(qs);
  }, [source, reviewId, !!data]);

  if (err) return html`<${ErrorBox} msg=${err} />`;
  if (!data) return html`<${Loading} />`;

  // Bộ câu hỏi đang chọn
  let pack = null;
  if (source === 'toan' && topics.length) {
    const names = MATH_TOPICS.filter((t) => topics.includes(t.id)).map((t) => t.name);
    pack = { label: 'Toán · ' + (names.length > 2 ? names.length + ' chủ đề' : names.join(', ')), regen: () => mathItems(topics, 40) };
  } else if (source === 'anh' && units.length) {
    const names = EN_UNITS.filter((u) => units.includes(u.id)).map((u) => u.name.split('.')[0]);
    pack = { label: 'Tiếng Anh · ' + names.join(', '), items: englishItems(units) };
  } else if (source === 'on' && review && review.length) {
    const a = data.assignments.find((x) => x.id === reviewId);
    pack = { label: 'Ôn bài · ' + (a ? a.title : 'tất cả bài đã làm'), items: review };
  } else if (source === 'ai' && aiPack) {
    pack = aiPack;
  }
  const sample = pack ? (pack.regen ? pack.regen() : pack.items) : [];
  const okFor = (g) => sample.length >= g.min && (!g.needWord || sample.filter(canScramble).length >= 4);

  async function makeAi() {
    if (!aiPick.subject || !(aiPick.lesson || aiPick.chapter)) { toast('Hãy chọn môn và bài học.', 'error'); return; }
    setAiBusy(true);
    try {
      const lesson = aiPick.lesson || aiPick.chapter;
      const r = await ai({ action: 'game_quiz', subject: aiPick.subject, lesson });
      setAiPack({ label: `AI · ${aiPick.subject} · ${lesson}`.slice(0, 110), items: r.items });
      toast(`AI đã soạn ${r.items.length} câu hỏi. Chọn trò chơi bên dưới nhé!`);
    } catch (e) { toast(e.message, 'error'); }
    setAiBusy(false);
  }

  if (playing) return html`<${GamePlay} game=${playing.game} pack=${playing.pack} profile=${profile} onExit=${() => { setPlaying(null); reload(); }} />`;

  const st = data.status;
  if (st && st.locked) return html`
    <div class="card center g-lock">
      <div class="g-face">🔒</div>
      <h2>Làm xong bài rồi chơi nhé!</h2>
      <p>Em còn <b>${st.pending}</b> bài anh giao chưa nộp. Nộp xong là Góc trò chơi tự mở.</p>
      <a class="btn primary" href="#/">Đi làm bài</a>
    </div>`;

  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  return html`
    <div class="page-head">
      <div>
        <h1>Góc trò chơi 🎮</h1>
        <p class="page-sub">Vừa chơi vừa ôn bài. ${st ? html`Hôm nay: <b>${st.stars_today}/${st.cap} ⭐</b> từ trò chơi.` : 'Bạn đang chơi thử (không tính sao).'}</p>
      </div>
    </div>

    <div class="card">
      <div class="card-title">① Chọn nội dung ôn</div>
      <div class="chips">${SOURCES.map((s) => html`<button class=${'chip ' + (source === s.id ? 'on' : '')} onClick=${() => setSource(s.id)}>${s.label}</button>`)}</div>
      ${source === 'toan' && html`
        <div class="chips sub">${MATH_TOPICS.map((t) => html`<button class=${'chip ' + (topics.includes(t.id) ? 'on' : '')} onClick=${() => toggle(topics, setTopics, t.id)}>${t.icon} ${t.name}</button>`)}</div>
        <p class="small muted">Câu hỏi tự sinh mới mỗi lượt chơi. Chọn được nhiều chủ đề.</p>`}
      ${source === 'anh' && html`
        <div class="chips sub">${EN_UNITS.map((u) => html`<button class=${'chip ' + (units.includes(u.id) ? 'on' : '')} onClick=${() => toggle(units, setUnits, u.id)}>${u.name}</button>`)}</div>
        <p class="small muted">Từ vựng sách Tiếng Anh 6 Global Success. Chọn nhiều Unit để ôn tổng hợp.</p>`}
      ${source === 'on' && html`
        ${data.assignments.length === 0 ? html`<p class="muted">Chưa có bài nào được trả. Làm bài anh giao xong là có câu hỏi để ôn ở đây.</p>` : html`
          <label>Bài muốn ôn
            <select value=${reviewId} onChange=${(e) => setReviewId(e.target.value)}>
              <option value="">Tất cả bài đã làm</option>
              ${data.assignments.map((a) => html`<option value=${a.id}>${a.subject} · ${a.title}</option>`)}
            </select>
          </label>
          ${review && review.length === 0 && html`<p class="small muted">Bài này không có câu trắc nghiệm / điền đáp án để chơi.</p>`}
          ${review && review.length > 0 && html`<p class="small muted">${review.length} câu hỏi từ bài đã làm.</p>`}`}`}
      ${source === 'ai' && html`
        <div class="ai-game">
          <${LessonPicker} subject=${aiPick.subject} onPick=${(p) => { setAiPick(p); setAiPack(null); }} />
          <button class="btn primary" disabled=${aiBusy} onClick=${makeAi}><${Icon} name="sparkles" /> ${aiBusy ? 'AI đang soạn câu hỏi…' : 'AI tạo câu hỏi'}</button>
          ${aiPack && html`<p class="small ok-text">✔ ${aiPack.items.length} câu hỏi: ${aiPack.label}</p>`}
          <p class="small muted">AI soạn câu hỏi theo đúng bài trong SGK lớp 6 (tối đa 15 lần mỗi ngày).</p>
        </div>`}
    </div>

    <div class="card">
      <div class="card-title">② Chọn trò chơi</div>
      ${!pack && html`<p class="muted small">Chọn nội dung ở trên trước nhé.</p>`}
      <div class="game-grid">
        ${GAMES.map((g) => html`
          <button class=${'game-card ' + (pack && okFor(g) ? '' : 'off')} disabled=${!pack || !okFor(g)} onClick=${() => setPlaying({ game: g, pack })}>
            <span class="game-ico">${g.icon}</span>
            <b>${g.name}</b>
            <span class="small">${g.needWord && pack && !okFor(g) ? 'Chỉ chơi với từ vựng Tiếng Anh' : g.desc}</span>
          </button>`)}
      </div>
    </div>

    ${isStudent && data.sessions.length > 0 && html`
      <div class="card">
        <div class="card-title">🕹️ Em vừa chơi</div>
        <ul class="star-log">
          ${data.sessions.map((s) => html`<li><span class="grow"><b>${s.game}</b> · ${s.pack}<br /><span class="small muted">${relTime(s.created_at)} · ${s.correct}/${s.total} câu đúng · ${s.score} điểm</span></span>
            ${s.stars > 0 && html`<span class="star-amt plus">+${s.stars}</span>`}</li>`)}
        </ul>
      </div>`}`;
}

// ---------------------------------------------------------------------
//  Trang của người giao bài: cài đặt + em đã chơi gì
// ---------------------------------------------------------------------
export function TeacherGames({ profile }) {
  const [form, setForm] = useState(null);
  const [data, err, reload] = useLoad(async () => {
    const students = await q(sb.from('profiles').select('id, full_name').eq('teacher_id', profile.id).order('created_at'));
    const ids = students.map((s) => s.id);
    const [settings, sessions] = await Promise.all([
      q(sb.from('game_settings').select('*').eq('teacher_id', profile.id).maybeSingle()),
      ids.length ? q(sb.from('game_sessions').select('*').in('student_id', ids).order('created_at', { ascending: false }).limit(60)) : [],
    ]);
    setForm({ lock: settings ? settings.lock_until_done : false, cap: settings ? settings.daily_star_cap : 2 });
    return { students, sessions };
  });
  if (err) return html`<${ErrorBox} msg=${err} />`;
  if (!data || !form) return html`<${Loading} />`;
  const names = Object.fromEntries(data.students.map((s) => [s.id, s.full_name]));
  const today = data.sessions.filter((s) => new Date(s.created_at).toDateString() === new Date().toDateString());

  async function save() {
    try { await rpc('save_game_settings', { p_lock: form.lock, p_cap: Number(form.cap) }); toast('Đã lưu cài đặt trò chơi.'); reload(); }
    catch (e) { toast(e.message, 'error'); }
  }
  return html`
    <div class="page-head">
      <div>
        <h1>Góc trò chơi</h1>
        <p class="page-sub">Em vừa chơi vừa ôn: Toán 6, từ vựng Tiếng Anh, bài đã làm, hoặc câu hỏi AI soạn theo bài học.</p>
      </div>
      <button class="btn primary" onClick=${() => go('/tro-choi/choi-thu')}>🎮 Chơi thử</button>
    </div>
    <div class="two-col">
      <div class="card stack">
        <div class="card-title"><${Icon} name="shield" /> Cài đặt</div>
        <label class="check-row">
          <input type="checkbox" checked=${form.lock} onChange=${(e) => setForm({ ...form, lock: e.target.checked })} />
          <span><b>Làm xong bài mới được chơi</b><br /><span class="small muted">Khi em còn bài anh giao chưa nộp, Góc trò chơi bị khoá.</span></span>
        </label>
        <label>Số ⭐ tối đa mỗi ngày từ trò chơi
          <select value=${String(form.cap)} onChange=${(e) => setForm({ ...form, cap: e.target.value })}>
            ${[0, 1, 2, 3, 4, 5].map((n) => html`<option value=${String(n)}>${n === 0 ? 'Không thưởng sao' : n + ' ⭐'}</option>`)}
          </select>
          <span class="hint">Mỗi lượt chơi đúng từ 80% (ít nhất 8 câu) được +1 ⭐.</span>
        </label>
        <div class="row end"><button class="btn primary" onClick=${save}>Lưu cài đặt</button></div>
      </div>
      <div class="card">
        <div class="card-title">📊 Hôm nay</div>
        <div class="g-stats">
          <div><b>${today.length}</b><span>lượt chơi</span></div>
          <div><b>${today.reduce((t, s) => t + s.total, 0)}</b><span>câu đã trả lời</span></div>
          <div><b>${today.reduce((t, s) => t + s.total, 0) ? Math.round((today.reduce((t, s) => t + s.correct, 0) / today.reduce((t, s) => t + s.total, 0)) * 100) + '%' : '–'}</b><span>trả lời đúng</span></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🕹️ Các lượt chơi gần đây</div>
      ${data.sessions.length === 0 ? html`<p class="muted">Em chưa chơi trò nào.</p>` : html`
        <ul class="star-log">
          ${data.sessions.map((s) => html`<li>
            <span class="grow"><b>${s.game}</b> · ${s.pack}<br />
              <span class="small muted">${data.students.length > 1 ? names[s.student_id] + ' · ' : ''}${relTime(s.created_at)} · ${s.correct}/${s.total} câu đúng · ${s.score} điểm · ${Math.round(s.seconds / 60) || '<1'} phút</span></span>
            ${s.stars > 0 && html`<span class="star-amt plus">+${s.stars}</span>`}</li>`)}
        </ul>`}
    </div>`;
}
