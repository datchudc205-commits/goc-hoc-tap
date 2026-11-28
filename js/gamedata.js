// Nội dung cho Góc trò chơi. Mỗi câu: { q, a, wrong: [3 đáp án sai], word? (từ tiếng Anh để xếp chữ) }
export const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (arr) => arr[rand(0, arr.length - 1)];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((d) => SUP[d]).join('');
const neg = (n) => (n < 0 ? `(${n})` : String(n));

// 3 đáp án sai dạng số, gần đáp án đúng
function numWrong(ans, { allowNeg = false, extra = [] } = {}) {
  const near = shuffle([ans + 1, ans - 1, ans + 10, ans - 10, ans + 2, ans - 2, ans * 2, Math.round(ans / 2),
    Number(String(Math.abs(ans)).split('').reverse().join('')) * Math.sign(ans || 1), ans + rand(3, 9), ans - rand(3, 9)]);
  const cands = [...extra, ...near];
  const out = [];
  for (const c of cands) {
    if (out.length === 3) break;
    if (!Number.isFinite(c) || c === ans || out.includes(c) || (!allowNeg && c < 0)) continue;
    out.push(c);
  }
  while (out.length < 3) { const c = ans + rand(11, 30) * (out.length % 2 ? -1 : 1); if (c !== ans && !out.includes(c) && (allowNeg || c >= 0)) out.push(c); }
  return out.map(String);
}
const item = (q, a, wrong) => ({ q, a: String(a), wrong: wrong.map(String) });

// ---------------------------------------------------------------------
//  TOÁN LỚP 6 – tự sinh câu hỏi
// ---------------------------------------------------------------------
export const MATH_TOPICS = [
  { id: 'tinh', name: 'Cộng, trừ, nhân, chia', icon: '➕', make() {
    const op = pick(['+', '−', '×', ':']);
    if (op === '+') { const a = rand(12, 899), b = rand(12, 899); return item(`${a} + ${b} = ?`, a + b, numWrong(a + b)); }
    if (op === '−') { let a = rand(50, 999), b = rand(10, 499); if (a < b) [a, b] = [b, a]; return item(`${a} − ${b} = ?`, a - b, numWrong(a - b)); }
    if (op === '×') { const a = rand(6, 99), b = rand(3, 12); return item(`${a} × ${b} = ?`, a * b, numWrong(a * b, { extra: [a * (b + 1), a * (b - 1)] })); }
    const b = rand(3, 12), qt = rand(6, 99); return item(`${b * qt} : ${b} = ?`, qt, numWrong(qt));
  } },
  { id: 'thutu', name: 'Thứ tự thực hiện phép tính', icon: '🧮', make() {
    const a = rand(2, 30), b = rand(2, 12), c = rand(2, 9);
    const f = rand(1, 4);
    if (f === 1) return item(`${a} + ${b} × ${c} = ?`, a + b * c, numWrong(a + b * c, { extra: [(a + b) * c] }));
    if (f === 2) return item(`${c} × (${a} + ${b}) = ?`, c * (a + b), numWrong(c * (a + b), { extra: [c * a + b] }));
    if (f === 3) { const d = b * c + a; return item(`${d} − ${b * c} : ${c} = ?`, d - b, numWrong(d - b, { extra: [(d - b * c) / c].filter(Number.isInteger) })); }
    return item(`${b}${sup(2)} − ${c} × ${c} = ?`, b * b - c * c, numWrong(b * b - c * c, { allowNeg: true, extra: [(b - c) * (b - c)] }));
  } },
  { id: 'luythua', name: 'Lũy thừa', icon: '🔢', make() {
    const base = rand(2, 10), e = base <= 3 ? rand(2, 6) : base <= 5 ? rand(2, 4) : rand(2, 3);
    const ans = base ** e;
    if (Math.random() < 0.3) return item(`${base}${sup(e)} · ${base}${sup(2)} = ${base} mũ mấy?`, e + 2, numWrong(e + 2, { extra: [e * 2] }));
    return item(`${base}${sup(e)} = ?`, ans, numWrong(ans, { extra: [base * e, base ** (e - 1)] }));
  } },
  { id: 'chiahet', name: 'Dấu hiệu chia hết', icon: '➗', make() {
    const d = pick([2, 3, 5, 9]);
    let good; do { good = rand(100, 999); } while (good % d);
    const bad = [];
    while (bad.length < 3) { const n = rand(100, 999); if (n % d && !bad.includes(n)) bad.push(n); }
    return item(`Số nào chia hết cho ${d}?`, good, bad);
  } },
  { id: 'ucbc', name: 'ƯCLN và BCNN', icon: '🔗', make() {
    let x, y; do { x = rand(1, 7); y = rand(2, 9); } while (x === y || gcd(x, y) !== 1);
    const g = rand(2, 8), a = g * x, b = g * y;
    if (Math.random() < 0.5) return item(`ƯCLN(${a}, ${b}) = ?`, g, numWrong(g, { extra: [g * 2, x * y, Math.min(a, b)].filter((v) => v !== g) }));
    const l = g * x * y; return item(`BCNN(${a}, ${b}) = ?`, l, numWrong(l, { extra: [a * b, l * 2].filter((v) => v !== l) }));
  } },
  { id: 'songuyen', name: 'Số nguyên', icon: '±', make() {
    const a = rand(-25, 25) || 7, b = rand(-20, 20) || -4;
    const op = pick(['+', '−', '×']);
    const ans = op === '+' ? a + b : op === '−' ? a - b : a * b;
    return item(`${neg(a)} ${op} ${neg(b)} = ?`, ans, numWrong(ans, { allowNeg: true, extra: [-ans, op === '−' ? a + b : op === '+' ? a - b : -a * b].filter((v) => v !== ans) }));
  } },
  { id: 'phanso', name: 'Phân số', icon: '½', make() {
    let x, y; do { x = rand(1, 8); y = rand(2, 9); } while (x >= y || gcd(x, y) !== 1);
    const k = rand(2, 9);
    if (Math.random() < 0.6) {
      const wrong = [`${y}/${x}`, x + 1 < y ? `${x + 1}/${y}` : `${x}/${2 * y}`, `${x}/${y + 1}`, `${k * x}/${y}`].filter((w) => w !== `${x}/${y}`);
      return item(`Rút gọn ${k * x}/${k * y} = ?`, `${x}/${y}`, shuffle(wrong).slice(0, 3));
    }
    const n = rand(2, 6) * y, part = (n / y) * x;
    return item(`${x}/${y} của ${n} là bao nhiêu?`, part, numWrong(part, { extra: [n / y, n * x] }));
  } },
];

// ---------------------------------------------------------------------
//  TIẾNG ANH 6 (Global Success) – từ vựng theo Unit
// ---------------------------------------------------------------------
const V = (s) => s.split(';').map((p) => { const [w, m] = p.split('='); return { word: w.trim(), meaning: m.trim() }; });
export const EN_UNITS = [
  { id: 'u1', name: 'Unit 1. My new school', words: V('pencil=bút chì;compass=com-pa;calculator=máy tính bỏ túi;rubber=cục tẩy;uniform=đồng phục;notebook=quyển vở;homework=bài tập về nhà;classmate=bạn cùng lớp;lesson=bài học;library=thư viện;playground=sân chơi;teacher=giáo viên') },
  { id: 'u2', name: 'Unit 2. My house', words: V('kitchen=nhà bếp;bedroom=phòng ngủ;bathroom=phòng tắm;fridge=tủ lạnh;sofa=ghế sô-pha;lamp=cái đèn;wardrobe=tủ quần áo;cupboard=tủ chén;dishwasher=máy rửa bát;apartment=căn hộ;attic=gác mái;poster=áp phích') },
  { id: 'u3', name: 'Unit 3. My friends', words: V('friendly=thân thiện;creative=sáng tạo;kind=tốt bụng;clever=thông minh;funny=hài hước;confident=tự tin;careful=cẩn thận;active=năng động;shy=nhút nhát;curious=tò mò;generous=hào phóng;patient=kiên nhẫn') },
  { id: 'u4', name: 'Unit 4. My neighbourhood', words: V('cathedral=nhà thờ lớn;temple=ngôi đền;square=quảng trường;museum=bảo tàng;market=cái chợ;bakery=tiệm bánh;crowded=đông đúc;quiet=yên tĩnh;noisy=ồn ào;modern=hiện đại;convenient=thuận tiện;polluted=bị ô nhiễm') },
  { id: 'u5', name: 'Unit 5. Natural wonders of Viet Nam', words: V('mountain=ngọn núi;river=dòng sông;island=hòn đảo;forest=khu rừng;desert=sa mạc;waterfall=thác nước;cave=hang động;beach=bãi biển;lake=cái hồ;valley=thung lũng;backpack=ba lô;scissors=cái kéo') },
  { id: 'u6', name: 'Unit 6. Our Tet holiday', words: V('firework=pháo hoa;decorate=trang trí;celebrate=ăn mừng;relative=họ hàng;festival=lễ hội;wish=lời chúc;cook=nấu ăn;flower=bông hoa;special=đặc biệt;visit=đi thăm;clean=dọn dẹp;family=gia đình') },
  { id: 'u7', name: 'Unit 7. Television', words: V('channel=kênh truyền hình;programme=chương trình;cartoon=phim hoạt hình;comedy=phim hài;character=nhân vật;viewer=người xem;educational=mang tính giáo dục;schedule=lịch chiếu;reporter=phóng viên;documentary=phim tài liệu;audience=khán giả;popular=phổ biến') },
  { id: 'u8', name: 'Unit 8. Sports and games', words: V('football=bóng đá;swimming=bơi lội;cycling=đạp xe;marathon=chạy ma-ra-tông;racket=cái vợt;goggles=kính bơi;champion=nhà vô địch;competition=cuộc thi;exercise=tập thể dục;chess=cờ vua;volleyball=bóng chuyền;skiing=trượt tuyết') },
  { id: 'u9', name: 'Unit 9. Cities of the world', words: V('capital=thủ đô;famous=nổi tiếng;landmark=địa danh;tower=tòa tháp;palace=cung điện;rainy=có nhiều mưa;exciting=sôi động;postcard=bưu thiếp;continent=châu lục;building=tòa nhà;beautiful=xinh đẹp;crowd=đám đông') },
  { id: 'u10', name: 'Unit 10. Our houses in the future', words: V('skyscraper=nhà chọc trời;appliance=thiết bị;wireless=không dây;smart=thông minh;ocean=đại dương;space=không gian;helicopter=trực thăng;garden=khu vườn;view=quang cảnh;solar=năng lượng mặt trời;machine=máy móc;mountain=ngọn núi') },
  { id: 'u11', name: 'Unit 11. Our greener world', words: V('recycle=tái chế;reuse=tái sử dụng;reduce=giảm bớt;rubbish=rác;plastic=nhựa;environment=môi trường;pollution=sự ô nhiễm;bottle=cái chai;energy=năng lượng;protect=bảo vệ;plant=trồng cây;paper=giấy') },
  { id: 'u12', name: 'Unit 12. Robots', words: V('robot=người máy;guard=canh gác;planet=hành tinh;recognise=nhận ra;understand=hiểu;feeling=cảm xúc;housework=việc nhà;future=tương lai;iron=ủi quần áo;water=tưới nước;laundry=giặt giũ;teach=dạy học') },
];

export function englishItems(unitIds) {
  const units = EN_UNITS.filter((u) => unitIds.includes(u.id));
  const words = units.flatMap((u) => u.words);
  const allMeanings = EN_UNITS.flatMap((u) => u.words.map((w) => w.meaning));
  return shuffle(words).map((w) => {
    const pool = shuffle(words.map((x) => x.meaning).filter((m) => m !== w.meaning));
    const wrong = [...new Set([...pool, ...shuffle(allMeanings)])].filter((m) => m !== w.meaning).slice(0, 3);
    return { q: w.word, a: w.meaning, wrong, word: w.word };
  });
}

export function mathItems(topicIds, n = 40) {
  const topics = MATH_TOPICS.filter((t) => topicIds.includes(t.id));
  const seen = new Set(), out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 20) {
    const it = pick(topics).make();
    const key = it.q + '|' + it.a;
    if (seen.has(key) || new Set([it.a, ...it.wrong]).size < 4) continue;
    seen.add(key); out.push(it);
  }
  return out;
}

// ---------------------------------------------------------------------
//  ÔN BÀI ĐÃ LÀM – lấy câu trắc nghiệm / điền đáp án từ bài đã trả
// ---------------------------------------------------------------------
export function reviewItems(questions) {
  const shortAnswers = questions.filter((x) => x.type === 'short').map((x) => keyOf(x)?.accepted?.[0]).filter(Boolean);
  const out = [];
  for (const x of questions) {
    const k = keyOf(x);
    if (!k || !k.accepted || !k.accepted.length) continue;
    if (x.type === 'mcq') {
      const i = Number(k.accepted[0]);
      const a = x.options[i];
      if (a == null) continue;
      let wrong = x.options.filter((_, j) => j !== i);
      if (wrong.length < 3) wrong = [...wrong, ...shuffle(shortAnswers).filter((s) => s !== a && !wrong.includes(s))].slice(0, 3);
      if (wrong.length === 3) out.push(item(x.prompt, a, wrong));
    } else if (x.type === 'short') {
      const a = k.accepted[0];
      const n = Number(String(a).replace(',', '.'));
      const wrong = Number.isFinite(n) && /^-?\d+$/.test(String(a).trim())
        ? numWrong(n, { allowNeg: n < 0 })
        : shuffle(shortAnswers.filter((s) => s !== a)).slice(0, 3);
      if (wrong.length === 3) out.push(item(x.prompt, a, wrong));
    }
  }
  return shuffle(out);
}
function keyOf(x) { return Array.isArray(x.question_keys) ? x.question_keys[0] : x.question_keys; }

// Câu "Đúng hay sai": thay dấu "?" bằng đáp án đang xét
export function statement(it, shown) {
  if (/=\s*\?\s*$/.test(it.q)) return it.q.replace(/\?\s*$/, shown);
  if (it.word) return `${it.q} = ${shown}`;
  return `${it.q}  ➜  ${shown}`;
}
export const canScramble = (it) => !!it.word && /^[a-z]{3,12}$/i.test(it.word);
