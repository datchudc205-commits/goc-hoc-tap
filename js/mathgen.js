// Sinh đề toán tự động (không cần AI): cộng, trừ, nhân, chia
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export const OPS = {
  '+': 'Cộng',
  '-': 'Trừ (kết quả không âm)',
  '×': 'Nhân',
  ':': 'Chia hết (cho 2–9)',
};

/**
 * @param {{ops: string[], min: number, max: number, count: number, points: number}} cfg
 * @returns câu hỏi dạng "điền đáp án" đúng định dạng của trình soạn bài
 */
export function generateMath({ ops, min, max, count, points }) {
  if (!ops.length) throw new Error('Hãy chọn ít nhất 1 phép tính.');
  if (!(Number.isFinite(min) && Number.isFinite(max)) || min < 0 || max < min) {
    throw new Error('Khoảng số không hợp lệ (từ ≥ 0 và đến ≥ từ).');
  }
  if (!(count >= 1 && count <= 100)) throw new Error('Số câu từ 1 đến 100.');

  const seen = new Set();
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 50) {
    const op = ops[rand(0, ops.length - 1)];
    let a = rand(min, max), b = rand(min, max), ans;
    if (op === '+') ans = a + b;
    else if (op === '-') { if (a < b) [a, b] = [b, a]; ans = a - b; }
    else if (op === '×') ans = a * b;
    else {
      // chia hết: số bị chia nằm trong khoảng [min, max], số chia từ 2 đến 9
      b = rand(2, 9);
      const qMin = Math.max(1, Math.ceil(min / b)), qMax = Math.floor(max / b);
      if (qMax < qMin) continue;
      ans = rand(qMin, qMax);
      a = b * ans;
    }
    const prompt = `${a} ${op} ${b} = ?`;
    if (seen.has(prompt) && guard < count * 40) continue;
    seen.add(prompt);
    out.push({ type: 'short', prompt, options: [], accepted: [String(ans)], explanation: `${a} ${op} ${b} = ${ans}`, points });
  }
  if (!out.length) throw new Error('Không tạo được câu nào với khoảng số này (phép chia cần "đến" ≥ 2).');
  return out;
}
