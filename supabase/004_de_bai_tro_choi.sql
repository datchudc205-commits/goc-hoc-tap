-- =====================================================================
--  GÓC HỌC TẬP – Nâng cấp 4: ảnh đề bài (AI đọc đề trước khi kiểm tra), góc trò chơi
--  Chạy SAU 003_thuong_phat.sql. Chạy lại nhiều lần được.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ẢNH ĐỀ BÀI cho "Kiểm tra bài trên lớp"
-- ---------------------------------------------------------------------
alter table public.classwork add column if not exists problem_paths text[] not null default '{}';
alter table public.classwork add column if not exists problems jsonb;

create or replace function public.check_image_paths(p_student uuid, p_images text[]) returns void
language plpgsql immutable as $$
begin
  if exists (select 1 from unnest(coalesce(p_images, '{}')) x where left(x, 37) <> p_student::text || '/') then
    raise exception 'Ảnh không hợp lệ';
  end if;
end $$;

create or replace function public.create_classwork(p_student uuid, p_subject text, p_lesson text, p_note text,
                                                   p_images text[], p_problem_images text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if coalesce(cardinality(p_problem_images), 0) > 4 then raise exception 'Tối đa 4 ảnh đề bài'; end if;
  v_id := public.create_classwork(p_student, p_subject, p_lesson, p_note, p_images);
  perform public.check_image_paths(coalesce(p_student, auth.uid()), p_problem_images);
  update public.classwork set problem_paths = coalesce(p_problem_images, '{}') where id = v_id;
  return v_id;
end $$;

-- Thêm / thay ảnh đề bài cho bài đã gửi (xoá đề AI đã đọc để đọc lại)
create or replace function public.set_classwork_problem_images(p_id uuid, p_images text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
begin
  select student_id into v_student from public.classwork where id = p_id and public.can_access_student(student_id);
  if v_student is null then raise exception 'Không tìm thấy bài'; end if;
  if coalesce(cardinality(p_images), 0) > 4 then raise exception 'Tối đa 4 ảnh đề bài'; end if;
  perform public.check_image_paths(v_student, p_images);
  update public.classwork set problem_paths = coalesce(p_images, '{}'), problems = null where id = p_id;
end $$;

-- Lưu đề bài AI đọc được (hoặc người dùng sửa lại): [{"label":"Bài 1","text":"..."}]
create or replace function public.save_classwork_problems(p_id uuid, p_problems jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_problems is not null and (jsonb_typeof(p_problems) <> 'array' or jsonb_array_length(p_problems) > 40
     or length(p_problems::text) > 20000) then
    raise exception 'Đề bài không hợp lệ';
  end if;
  update public.classwork set problems = p_problems where id = p_id and public.can_access_student(student_id);
  if not found then raise exception 'Không tìm thấy bài'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. GÓC TRÒ CHƠI
-- ---------------------------------------------------------------------
create table if not exists public.game_settings (
  teacher_id      uuid primary key references public.profiles(id) on delete cascade,
  lock_until_done boolean not null default false,
  daily_star_cap  int not null default 2 check (daily_star_cap between 0 and 5),
  updated_at      timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  game       text not null check (length(game) between 1 and 30),
  pack       text not null default '' check (length(pack) <= 120),
  score      int not null default 0,
  correct    int not null default 0,
  total      int not null default 0,
  seconds    int not null default 0,
  stars      int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists game_sessions_student_idx on public.game_sessions(student_id, created_at desc);

-- Đầu ngày theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè)
create or replace function public.vn_today_start() returns timestamptz
language sql stable as $$
  select (date_trunc('day', (now() at time zone 'UTC') + interval '7 hours') - interval '7 hours') at time zone 'UTC'
$$;

create or replace function public.save_game_settings(p_lock boolean, p_cap int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'teacher' then raise exception 'Chỉ người giao bài mới đổi được cài đặt'; end if;
  if p_cap is null or p_cap not between 0 and 5 then raise exception 'Số sao mỗi ngày từ 0 đến 5'; end if;
  insert into public.game_settings (teacher_id, lock_until_done, daily_star_cap, updated_at)
  values (auth.uid(), coalesce(p_lock, false), p_cap, now())
  on conflict (teacher_id) do update
    set lock_until_done = excluded.lock_until_done, daily_star_cap = excluded.daily_star_cap, updated_at = now();
end $$;

-- Tình trạng của em: có bị khoá vì còn bài chưa làm không, hôm nay được bao nhiêu sao từ trò chơi
create or replace function public.game_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_teacher uuid := public.my_teacher_id();
  v_lock boolean := false;
  v_cap int := 2;
  v_pending int := 0;
  v_today int;
begin
  select lock_until_done, daily_star_cap into v_lock, v_cap from public.game_settings where teacher_id = v_teacher;
  v_lock := coalesce(v_lock, false); v_cap := coalesce(v_cap, 2);
  select count(*) into v_pending
    from public.assignments a
   where a.student_id = auth.uid() and a.published
     and not exists (select 1 from public.submissions s where s.assignment_id = a.id
                     and s.student_id = auth.uid() and s.status in ('submitted', 'returned'));
  select coalesce(sum(stars), 0) into v_today from public.game_sessions
   where student_id = auth.uid() and created_at >= public.vn_today_start();
  return jsonb_build_object('locked', v_lock and v_pending > 0, 'lock_until_done', v_lock,
                            'pending', v_pending, 'stars_today', v_today, 'cap', v_cap);
end $$;

-- Em chơi xong một lượt: lưu kết quả; đúng ≥ 80% (ít nhất 8 câu) thì +1 ⭐, tối đa theo cài đặt mỗi ngày
create or replace function public.finish_game(p_game text, p_pack text, p_score int, p_correct int, p_total int, p_seconds int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_total int := least(greatest(coalesce(p_total, 0), 0), 200);
  v_correct int := least(greatest(coalesce(p_correct, 0), 0), least(greatest(coalesce(p_total, 0), 0), 200));
  v_seconds int := least(greatest(coalesce(p_seconds, 0), 0), 3600);
  v_status jsonb;
  v_id uuid;
  v_star int := 0;
begin
  if public.my_role() <> 'student' then raise exception 'Chỉ học sinh mới lưu kết quả trò chơi'; end if;
  if (select count(*) from public.game_sessions where student_id = auth.uid() and created_at >= public.vn_today_start()) >= 100 then
    raise exception 'Hôm nay em chơi nhiều rồi, nghỉ ngơi chút nhé!';
  end if;
  v_status := public.game_status();
  if (v_status->>'locked')::boolean then raise exception 'Em làm xong bài được giao rồi mới chơi được nhé!'; end if;
  insert into public.game_sessions (student_id, game, pack, score, correct, total, seconds)
  values (auth.uid(), left(coalesce(nullif(btrim(p_game), ''), 'game'), 30), left(coalesce(p_pack, ''), 120),
          least(greatest(coalesce(p_score, 0), 0), 100000), v_correct, v_total, v_seconds)
  returning id into v_id;
  if v_total >= 8 and v_correct * 10 >= v_total * 8 and v_seconds >= 15
     and (v_status->>'stars_today')::int < (v_status->>'cap')::int then
    v_star := 1;
    update public.game_sessions set stars = 1 where id = v_id;
    insert into public.star_events (student_id, teacher_id, amount, reason, kind, code, ref_id)
    values (auth.uid(), public.my_teacher_id(), 1, 'Trò chơi: ' || left(p_game, 30) || ' (' || v_correct || '/' || v_total || ' câu đúng)',
            'auto', 'game', v_id);
  end if;
  return v_star;
end $$;

-- Giới hạn số lần dùng AI mỗi ngày (Edge Function gọi trước khi hỏi Gemini)
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage(user_id, kind, created_at desc);

create or replace function public.use_ai(p_kind text, p_limit int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập'; end if;
  if (select count(*) from public.ai_usage where user_id = auth.uid() and kind = p_kind
        and created_at >= public.vn_today_start()) >= p_limit then
    raise exception 'Hôm nay em đã dùng hết % lượt AI tạo câu hỏi. Mai chơi tiếp nhé!', p_limit;
  end if;
  insert into public.ai_usage (user_id, kind) values (auth.uid(), left(p_kind, 30));
end $$;

-- ---------------------------------------------------------------------
-- 3. PHÂN QUYỀN
-- ---------------------------------------------------------------------
alter table public.game_settings enable row level security;
alter table public.game_sessions enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "game_settings_read" on public.game_settings;
create policy "game_settings_read" on public.game_settings for select to authenticated
  using (teacher_id = auth.uid() or teacher_id = public.my_teacher_id() or public.is_admin());

drop policy if exists "game_sessions_read" on public.game_sessions;
create policy "game_sessions_read" on public.game_sessions for select to authenticated
  using (public.can_access_student(student_id));

grant select on public.game_settings, public.game_sessions to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_classwork(uuid, text, text, text, text[], text[])', 'public.set_classwork_problem_images(uuid, text[])',
    'public.save_classwork_problems(uuid, jsonb)', 'public.save_game_settings(boolean, int)', 'public.game_status()',
    'public.finish_game(text, text, int, int, int, int)', 'public.use_ai(text, int)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
