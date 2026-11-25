import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, USERNAME_DOMAIN } from './config.js';

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const BUCKET = 'bai-lam';

// "lan" → "lan@hocsinh.example"; email thật giữ nguyên
export function toEmail(login) {
  const s = login.trim().toLowerCase();
  return s.includes('@') ? s : `${s}@${USERNAME_DOMAIN}`;
}

const MESSAGES = [
  [/invalid login credentials/i, 'Sai tên đăng nhập hoặc mật khẩu.'],
  [/user already registered/i, 'Tài khoản này đã tồn tại. Hãy đăng nhập.'],
  [/password should be at least/i, 'Mật khẩu cần ít nhất 6 ký tự.'],
  [/email not confirmed/i, 'Email chưa được xác nhận. Hãy mở email để xác nhận, hoặc tắt "Confirm email" trong Supabase.'],
  [/database error saving new user/i, 'Không tạo được tài khoản. Kiểm tra lại mã mời.'],
  [/unable to validate email|invalid format|email address .* is invalid/i, 'Email/tên đăng nhập không hợp lệ.'],
  [/rate limit/i, 'Thao tác quá nhanh, hãy đợi một chút rồi thử lại.'],
  [/failed to fetch|networkerror|load failed/i, 'Mất kết nối mạng. Hãy kiểm tra Internet rồi thử lại.'],
];

export function viError(err) {
  const msg = (err && (err.message || err.error_description)) || String(err);
  for (const [re, vi] of MESSAGES) if (re.test(msg)) return vi;
  return msg;
}

// Chạy truy vấn Supabase, ném lỗi tiếng Việt nếu có
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(viError(error));
  return data;
}

export const rpc = (fn, args) => q(sb.rpc(fn, args));

// Lấy link xem ảnh (ảnh để ở kho riêng tư nên cần link có hạn)
export async function signedUrls(paths) {
  if (!paths.length) return {};
  const data = await q(sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60));
  const map = {};
  for (const item of data) if (item.signedUrl) map[item.path] = item.signedUrl;
  return map;
}
