// ============================================================
//  CẤU HÌNH – điền 2 giá trị lấy từ Supabase:
//  Project Settings → API → "Project URL" và khoá "anon public"
//  (khoá anon được phép để công khai; dữ liệu đã được bảo vệ bằng RLS)
// ============================================================
export const SUPABASE_URL = 'https://oxuvhahscmxcfcukenvc.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_U8ymo34HXmORRcrHYQnTmA_gaGU-Dxj';

// Học sinh có thể đăng nhập bằng "tên đăng nhập" thay vì email.
// App sẽ tự ghép thành <tên>@<đuôi này>. Không cần sửa.
export const USERNAME_DOMAIN = 'hocsinh.example';
