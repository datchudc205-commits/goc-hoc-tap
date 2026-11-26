-- =====================================================================
--  GÓC HỌC TẬP – Nâng cấp 2: Admin, đặt lại mật khẩu, lớp học, kiểm tra bài trên lớp
--  Chạy SAU schema.sql (Supabase → SQL Editor → dán toàn bộ → Run). Chạy lại nhiều lần được.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. HỒ SƠ: quyền admin + lớp của học sinh
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists grade smallint;
alter table public.profiles drop constraint if exists profiles_grade_check;
alter table public.profiles add constraint profiles_grade_check check (grade is null or grade between 1 and 12);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Tạo hồ sơ khi đăng ký: thêm lớp (grade) cho học sinh
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role    text := coalesce(new.raw_user_meta_data ->> 'role', 'student');
  v_name    text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  v_code    text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_grade   text := btrim(coalesce(new.raw_user_meta_data ->> 'grade', ''));
  v_teacher uuid;
begin
  if v_role = 'teacher' then
    insert into public.profiles (id, full_name, role, invite_code)
    values (new.id, v_name, 'teacher', public.gen_invite_code());
  else
    select id into v_teacher from public.profiles where invite_code = v_code and role = 'teacher';
    if v_teacher is null then
      raise exception 'Mã mời không đúng';
    end if;
    insert into public.profiles (id, full_name, role, teacher_id, grade)
    values (new.id, v_name, 'student', v_teacher,
            case when v_grade ~ '^[0-9]{1,2}$' and v_grade::int between 1 and 12 then v_grade::smallint end);
  end if;
  return new;
end $$;

-- Tên đăng nhập để hiển thị: "bena@hocsinh.example" → "bena"
create or replace function public.login_name(p_email text) returns text
language sql immutable as $$
  select case when p_email like '%@hocsinh.example' then split_part(p_email, '@', 1) else p_email end
$$;

-- ---------------------------------------------------------------------
-- 2. NGƯỜI GIAO BÀI: xem danh sách học sinh (kèm tên đăng nhập), đổi lớp, đặt lại mật khẩu
-- ---------------------------------------------------------------------
drop function if exists public.my_students();
create or replace function public.my_students()
returns table (id uuid, full_name text, login text, grade smallint, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, public.login_name(u.email::text), p.grade, p.created_at, u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.teacher_id = auth.uid()
   order by p.created_at
$$;

create or replace function public.set_student_grade(p_student uuid, p_grade int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_my_student(p_student::text) or public.is_admin()) then
    raise exception 'Không có quyền sửa học sinh này';
  end if;
  if p_grade is not null and p_grade not between 1 and 12 then
    raise exception 'Lớp phải từ 1 đến 12';
  end if;
  update public.profiles set grade = p_grade where id = p_student;
end $$;

-- Đặt lại mật khẩu: admin cho mọi tài khoản; người giao bài cho học sinh của mình
create or replace function public.reset_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_my_student(p_user::text)) then
    raise exception 'Không có quyền đặt lại mật khẩu tài khoản này';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Mật khẩu cần ít nhất 6 ký tự';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
  if not found then raise exception 'Không tìm thấy tài khoản'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. ADMIN
-- ---------------------------------------------------------------------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin mới xem được'; end if;
  return jsonb_build_object(
    'teachers',    (select count(*) from public.profiles where role = 'teacher'),
    'students',    (select count(*) from public.profiles where role = 'student'),
    'assignments', (select count(*) from public.assignments),
    'published',   (select count(*) from public.assignments where published),
    'submitted',   (select count(*) from public.submissions where status = 'submitted'),
    'returned',    (select count(*) from public.submissions where status = 'returned'),
    'classwork',   (select count(*) from public.classwork),
    'avg10',       (select round(avg(score / nullif(max_score, 0) * 10), 1) from public.submissions where status = 'returned'),
    'active7',     (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days')
  );
end $$;

drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (id uuid, full_name text, login text, role text, is_admin boolean, grade smallint,
               teacher_id uuid, teacher_name text, invite_code text, created_at timestamptz,
               last_sign_in_at timestamptz, banned boolean, n_assignments bigint, n_returned bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin mới xem được'; end if;
  return query
  select p.id, p.full_name, public.login_name(u.email::text), p.role, p.is_admin, p.grade,
         p.teacher_id, t.full_name, p.invite_code, p.created_at, u.last_sign_in_at,
         coalesce(u.banned_until > now(), false),
         (select count(*) from public.assignments a where a.teacher_id = p.id or a.student_id = p.id),
         (select count(*) from public.submissions s where s.student_id = p.id and s.status = 'returned')
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profiles t on t.id = p.teacher_id
   order by p.role desc, p.created_at;
end $$;

create or replace function public.admin_update_user(p_user uuid, p_full_name text, p_role text,
                                                    p_teacher uuid, p_grade int, p_is_admin boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin mới sửa được'; end if;
  if p_role not in ('teacher', 'student') then raise exception 'Vai trò không hợp lệ'; end if;
  if p_user = auth.uid() and (p_is_admin is false or p_role <> 'teacher') then
    raise exception 'Không thể tự bỏ quyền admin hoặc đổi vai trò của chính mình';
  end if;
  if p_role = 'student' then
    if p_teacher is null or not exists (select 1 from public.profiles where id = p_teacher and role = 'teacher') then
      raise exception 'Học sinh phải gắn với một người giao bài';
    end if;
    if p_teacher = p_user then raise exception 'Không thể tự gắn với chính mình'; end if;
  end if;
  if p_grade is not null and p_grade not between 1 and 12 then raise exception 'Lớp phải từ 1 đến 12'; end if;
  update public.profiles
     set full_name   = coalesce(nullif(btrim(p_full_name), ''), full_name),
         role        = p_role,
         teacher_id  = case when p_role = 'student' then p_teacher end,
         grade       = p_grade,
         is_admin    = coalesce(p_is_admin, false) and p_role = 'teacher',
         invite_code = case when p_role = 'teacher' then coalesce(invite_code, public.gen_invite_code()) end
   where id = p_user;
  if not found then raise exception 'Không tìm thấy tài khoản'; end if;
end $$;

create or replace function public.admin_set_banned(p_user uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin mới khoá được tài khoản'; end if;
  if p_user = auth.uid() then raise exception 'Không thể tự khoá chính mình'; end if;
  update auth.users set banned_until = case when p_banned then now() + interval '100 years' end, updated_at = now()
   where id = p_user;
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ admin mới xoá được tài khoản'; end if;
  if p_user = auth.uid() then raise exception 'Không thể tự xoá chính mình'; end if;
  delete from auth.users where id = p_user;
  if not found then raise exception 'Không tìm thấy tài khoản'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. KIỂM TRA BÀI TRÊN LỚP (ảnh chụp vở → AI kiểm tra → người giao bài nhận xét)
-- ---------------------------------------------------------------------
create table if not exists public.classwork (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles(id) on delete cascade,
  created_by      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject         text not null default 'Khác',
  lesson          text not null default '',
  note            text not null default '',
  image_paths     text[] not null default '{}',
  status          text not null default 'pending' check (status in ('pending', 'checked')),
  ai_result       jsonb,
  score           numeric(4,1),
  teacher_comment text not null default '',
  reviewed_at     timestamptz,
  checked_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists classwork_student_idx on public.classwork(student_id, created_at desc);

create or replace function public.can_access_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_student = auth.uid() or public.is_my_student(p_student::text) or public.is_admin()
$$;

create or replace function public.create_classwork(p_student uuid, p_subject text, p_lesson text, p_note text, p_images text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := coalesce(p_student, auth.uid());
  v_id uuid;
begin
  if not (v_student = auth.uid() or public.is_my_student(v_student::text)) then
    raise exception 'Không có quyền gửi bài cho học sinh này';
  end if;
  if not exists (select 1 from public.profiles where id = v_student and role = 'student') then
    raise exception 'Tài khoản này không phải học sinh';
  end if;
  if coalesce(cardinality(p_images), 0) = 0 then raise exception 'Hãy chụp ít nhất 1 ảnh bài làm'; end if;
  if cardinality(p_images) > 8 then raise exception 'Tối đa 8 ảnh cho một lần kiểm tra'; end if;
  if exists (select 1 from unnest(p_images) x where left(x, 37) <> v_student::text || '/') then
    raise exception 'Ảnh không hợp lệ';
  end if;
  insert into public.classwork (student_id, created_by, subject, lesson, note, image_paths)
  values (v_student, auth.uid(), coalesce(nullif(btrim(p_subject), ''), 'Khác'),
          coalesce(btrim(p_lesson), ''), coalesce(p_note, ''), p_images)
  returning id into v_id;
  return v_id;
end $$;

-- Lưu kết quả AI (Edge Function "ai" gọi bằng quyền của người dùng)
create or replace function public.save_classwork_result(p_id uuid, p_result jsonb, p_score numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.classwork
     set ai_result = p_result,
         score     = case when p_score between 0 and 10 then round(p_score, 1) end,
         status    = 'checked',
         checked_at = now()
   where id = p_id and public.can_access_student(student_id);
  if not found then raise exception 'Không tìm thấy bài'; end if;
end $$;

create or replace function public.review_classwork(p_id uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.classwork
     set teacher_comment = coalesce(p_comment, ''), reviewed_at = now()
   where id = p_id and (public.is_my_student(student_id::text) or public.is_admin());
  if not found then raise exception 'Chỉ người giao bài của em mới nhận xét được'; end if;
end $$;

create or replace function public.delete_classwork(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.classwork
   where id = p_id and (created_by = auth.uid() or public.is_my_student(student_id::text) or public.is_admin());
  if not found then raise exception 'Không xoá được bài này'; end if;
end $$;

alter table public.classwork enable row level security;
drop policy if exists "classwork_read" on public.classwork;
create policy "classwork_read" on public.classwork for select to authenticated
  using (public.can_access_student(student_id));

-- ---------------------------------------------------------------------
-- 5. CHO ADMIN XEM ĐƯỢC TOÀN BỘ DỮ LIỆU (chỉ đọc)
-- ---------------------------------------------------------------------
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select to authenticated
  using (id = auth.uid() or teacher_id = auth.uid() or id = public.my_teacher_id() or public.is_admin());

drop policy if exists "assignments_read" on public.assignments;
create policy "assignments_read" on public.assignments for select to authenticated
  using (teacher_id = auth.uid() or (student_id = auth.uid() and published) or public.is_admin());

drop policy if exists "questions_read" on public.questions;
create policy "questions_read" on public.questions for select to authenticated
  using (public.owns_assignment(assignment_id) or public.assigned_to_me(assignment_id) or public.is_admin());

drop policy if exists "keys_read" on public.question_keys;
create policy "keys_read" on public.question_keys for select to authenticated
  using (public.is_admin() or exists (select 1 from public.questions q
                 where q.id = question_id
                   and (public.owns_assignment(q.assignment_id) or public.returned_to_me(q.assignment_id))));

drop policy if exists "submissions_read" on public.submissions;
create policy "submissions_read" on public.submissions for select to authenticated
  using (student_id = auth.uid() or public.owns_assignment(assignment_id) or public.is_admin());

drop policy if exists "answers_read" on public.answers;
create policy "answers_read" on public.answers for select to authenticated
  using (public.is_admin() or exists (select 1 from public.submissions s
                 where s.id = submission_id
                   and (s.student_id = auth.uid() or public.owns_assignment(s.assignment_id))));

-- Kho ảnh: người giao bài được tải ảnh vào thư mục của học sinh mình (chụp bài trên lớp hộ em)
drop policy if exists "bai_lam_upload" on storage.objects;
create policy "bai_lam_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'bai-lam'
              and ((storage.foldername(name))[1] = auth.uid()::text
                   or public.is_my_student((storage.foldername(name))[1])));

drop policy if exists "bai_lam_read" on storage.objects;
create policy "bai_lam_read" on storage.objects for select to authenticated
  using (bucket_id = 'bai-lam'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.is_my_student((storage.foldername(name))[1])
              or public.is_admin()));

-- ---------------------------------------------------------------------
-- 6. QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------
grant select on public.classwork to authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_students()', 'public.set_student_grade(uuid, int)', 'public.reset_password(uuid, text)',
    'public.admin_stats()', 'public.admin_list_users()',
    'public.admin_update_user(uuid, text, text, uuid, int, boolean)', 'public.admin_set_banned(uuid, boolean)',
    'public.admin_delete_user(uuid)', 'public.create_classwork(uuid, text, text, text, text[])',
    'public.save_classwork_result(uuid, jsonb, numeric)', 'public.review_classwork(uuid, text)',
    'public.delete_classwork(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
