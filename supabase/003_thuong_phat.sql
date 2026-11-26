-- =====================================================================
--  GÓC HỌC TẬP – Nâng cấp 3: thời gian làm bài, thưởng sao, thử thách nhỏ, gợi ý cách làm
--  Chạy SAU schema.sql và 002_nang_cap.sql. Chạy lại nhiều lần được.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. THỜI GIAN LÀM BÀI
-- ---------------------------------------------------------------------
alter table public.assignments add column if not exists time_limit_minutes int;
alter table public.assignments drop constraint if exists assignments_time_limit_check;
alter table public.assignments add constraint assignments_time_limit_check
  check (time_limit_minutes is null or time_limit_minutes between 1 and 300);
alter table public.submissions add column if not exists extra_minutes int not null default 0;

-- Hạn chót của một bài làm (null = không giới hạn)
create or replace function public.submission_deadline(p_submission uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when a.time_limit_minutes is null then null
              else s.started_at + make_interval(mins => a.time_limit_minutes + s.extra_minutes) end
    from public.submissions s join public.assignments a on a.id = s.assignment_id
   where s.id = p_submission
$$;

-- Người giao bài đặt thời gian (gọi ngay sau save_assignment). Khoá khi em đã mở bài.
create or replace function public.set_time_limit(p_assignment uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_assignment(p_assignment) then raise exception 'Không tìm thấy bài tập'; end if;
  if p_minutes is not null and p_minutes not between 1 and 300 then
    raise exception 'Thời gian làm bài từ 1 đến 300 phút';
  end if;
  if exists (select 1 from public.submissions where assignment_id = p_assignment) then
    raise exception 'Em đã mở bài này nên không đổi được thời gian. Hãy dùng "Thêm giờ".';
  end if;
  update public.assignments set time_limit_minutes = p_minutes where id = p_assignment;
end $$;

-- Cộng thêm giờ cho bài đang làm
create or replace function public.add_extra_time(p_submission uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_minutes not between 1 and 120 then raise exception 'Chỉ thêm được 1–120 phút'; end if;
  update public.submissions s set extra_minutes = s.extra_minutes + p_minutes
   where s.id = p_submission and s.status = 'in_progress' and public.owns_assignment(s.assignment_id);
  if not found then raise exception 'Bài này không còn đang làm'; end if;
end $$;

-- Lưu câu trả lời: chặn khi đã hết giờ (cho phép trễ 60 giây do mạng)
create or replace function public.save_answer(p_submission uuid, p_question uuid, p_text text, p_images text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prefix   text := auth.uid()::text || '/' || p_submission::text || '/';
  v_deadline timestamptz;
begin
  if not exists (
    select 1 from public.submissions s
      join public.questions q on q.assignment_id = s.assignment_id
     where s.id = p_submission and s.student_id = auth.uid()
       and s.status = 'in_progress' and q.id = p_question
  ) then
    raise exception 'Bài đã nộp hoặc không hợp lệ nên không lưu được';
  end if;
  v_deadline := public.submission_deadline(p_submission);
  if v_deadline is not null and now() > v_deadline + interval '60 seconds' then
    raise exception 'Đã hết giờ làm bài';
  end if;
  if exists (select 1 from unnest(coalesce(p_images, '{}')) x where left(x, length(v_prefix)) <> v_prefix) then
    raise exception 'Ảnh không hợp lệ';
  end if;
  insert into public.answers (submission_id, question_id, answer_text, image_paths, updated_at)
  values (p_submission, p_question, coalesce(p_text, ''), coalesce(p_images, '{}'), now())
  on conflict (submission_id, question_id) do update
    set answer_text = excluded.answer_text,
        image_paths = excluded.image_paths,
        updated_at  = now();
end $$;

-- ---------------------------------------------------------------------
-- 2. SAO THƯỞNG ⭐
-- ---------------------------------------------------------------------
create table if not exists public.star_events (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  amount     int not null check (amount <> 0 and amount between -1000 and 100),
  reason     text not null,
  kind       text not null check (kind in ('auto', 'manual', 'redeem', 'task')),
  code       text,
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index if not exists star_events_student_idx on public.star_events(student_id, created_at desc);
create unique index if not exists star_events_once on public.star_events(ref_id, code)
  where ref_id is not null and code is not null;

create or replace function public.star_balance(p_student uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when public.can_access_student(p_student)
              then (select coalesce(sum(amount), 0)::int from public.star_events where student_id = p_student) end
$$;

-- Tự động: nộp đúng hạn +1, nộp muộn −1 (không để âm), điểm cao +1..+3 (chỉ lần trả bài đầu tiên)
create or replace function public.on_submission_stars() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a   public.assignments;
  v10 numeric;
  pts int;
begin
  select * into a from public.assignments where id = new.assignment_id;
  if old.status = 'in_progress' and new.status in ('submitted', 'returned') then
    if a.due_at is null or new.submitted_at <= a.due_at then
      insert into public.star_events (student_id, teacher_id, amount, reason, kind, code, ref_id)
      values (new.student_id, a.teacher_id, 1, 'Nộp đúng hạn: ' || a.title, 'auto', 'ontime', new.id)
      on conflict (ref_id, code) where ref_id is not null and code is not null do nothing;
    elsif public.star_balance(new.student_id) >= 1 then
      insert into public.star_events (student_id, teacher_id, amount, reason, kind, code, ref_id)
      values (new.student_id, a.teacher_id, -1, 'Nộp muộn: ' || a.title, 'auto', 'late', new.id)
      on conflict (ref_id, code) where ref_id is not null and code is not null do nothing;
    end if;
  end if;
  if new.status = 'returned' and old.status <> 'returned' and coalesce(new.max_score, 0) > 0 then
    v10 := new.score / new.max_score * 10;
    pts := case when v10 >= 9 then 3 when v10 >= 7 then 2 when v10 >= 5 then 1 else 0 end;
    if pts > 0 then
      insert into public.star_events (student_id, teacher_id, amount, reason, kind, code, ref_id)
      values (new.student_id, a.teacher_id, pts, 'Điểm ' || round(v10, 1) || '/10: ' || a.title, 'auto', 'score', new.id)
      on conflict (ref_id, code) where ref_id is not null and code is not null do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists submission_stars on public.submissions;
create trigger submission_stars after update of status on public.submissions
  for each row execute function public.on_submission_stars();

-- Người giao bài thưởng / nhắc nhở bằng tay (nhắc nhở tối đa −3 và không làm số sao âm)
create or replace function public.give_stars(p_student uuid, p_amount int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_my_student(p_student::text) then raise exception 'Không phải học sinh của bạn'; end if;
  if p_amount = 0 or p_amount not between -3 and 10 then raise exception 'Chỉ thưởng 1–10 sao hoặc nhắc nhở 1–3 sao'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Hãy ghi lý do'; end if;
  if p_amount < 0 and public.star_balance(p_student) + p_amount < 0 then
    raise exception 'Em chưa đủ sao để trừ – hãy thử giao "thử thách nhỏ" thay vì trừ sao';
  end if;
  insert into public.star_events (student_id, teacher_id, amount, reason, kind)
  values (p_student, auth.uid(), p_amount, btrim(p_reason), 'manual');
end $$;

-- ---------------------------------------------------------------------
-- 3. PHẦN THƯỞNG (cửa hàng đổi sao)
-- ---------------------------------------------------------------------
create table if not exists public.rewards (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 120),
  cost       int not null check (cost between 1 and 1000),
  icon       text not null default '🎁',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_requests (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  reward_id  uuid not null references public.rewards(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create or replace function public.request_reward(p_reward uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.rewards;
  v_id uuid;
begin
  select * into r from public.rewards where id = p_reward and active and teacher_id = public.my_teacher_id();
  if not found then raise exception 'Không tìm thấy phần thưởng'; end if;
  if public.star_balance(auth.uid()) < r.cost then raise exception 'Em chưa đủ sao để đổi phần thưởng này'; end if;
  if exists (select 1 from public.reward_requests where student_id = auth.uid() and reward_id = p_reward and status = 'pending') then
    raise exception 'Em đã xin đổi phần thưởng này rồi, chờ duyệt nhé';
  end if;
  insert into public.reward_requests (student_id, reward_id) values (auth.uid(), p_reward) returning id into v_id;
  return v_id;
end $$;

create or replace function public.decide_reward(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  q public.reward_requests;
  r public.rewards;
begin
  select * into q from public.reward_requests where id = p_request and status = 'pending' for update;
  if not found or not public.is_my_student(q.student_id::text) then raise exception 'Không tìm thấy yêu cầu'; end if;
  select * into r from public.rewards where id = q.reward_id;
  if p_approve then
    if public.star_balance(q.student_id) < r.cost then raise exception 'Em không còn đủ sao'; end if;
    insert into public.star_events (student_id, teacher_id, amount, reason, kind, code, ref_id)
    values (q.student_id, auth.uid(), -r.cost, 'Đổi quà: ' || r.icon || ' ' || r.title, 'redeem', 'redeem', q.id);
  end if;
  update public.reward_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
   where id = p_request;
end $$;

-- ---------------------------------------------------------------------
-- 4. THỬ THÁCH NHỎ (thay cho hình phạt – làm xong được cộng sao)
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  teacher_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  note         text not null default '',
  bonus        int not null default 1 check (bonus between 0 and 3),
  status       text not null default 'todo' check (status in ('todo', 'done', 'confirmed')),
  created_at   timestamptz not null default now(),
  done_at      timestamptz,
  confirmed_at timestamptz
);

create or replace function public.assign_task(p_student uuid, p_title text, p_note text, p_bonus int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_my_student(p_student::text) then raise exception 'Không phải học sinh của bạn'; end if;
  insert into public.tasks (student_id, teacher_id, title, note, bonus)
  values (p_student, auth.uid(), btrim(p_title), coalesce(p_note, ''), least(greatest(coalesce(p_bonus, 1), 0), 3))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.mark_task_done(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.tasks set status = 'done', done_at = now()
   where id = p_task and student_id = auth.uid() and status = 'todo';
  if not found then raise exception 'Không tìm thấy thử thách'; end if;
end $$;

create or replace function public.confirm_task(p_task uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task and teacher_id = auth.uid() and status = 'done' for update;
  if not found then raise exception 'Không tìm thấy thử thách đã làm xong'; end if;
  if p_ok then
    update public.tasks set status = 'confirmed', confirmed_at = now() where id = p_task;
    if t.bonus > 0 then
      insert into public.star_events (student_id, teacher_id, amount, reason, kind, code, ref_id)
      values (t.student_id, auth.uid(), t.bonus, 'Hoàn thành thử thách: ' || t.title, 'task', 'task', t.id)
      on conflict (ref_id, code) where ref_id is not null and code is not null do nothing;
    end if;
  else
    update public.tasks set status = 'todo', done_at = null where id = p_task;  -- nhờ em làm lại
  end if;
end $$;

create or replace function public.delete_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.tasks where id = p_task and teacher_id = auth.uid();
  if not found then raise exception 'Không tìm thấy thử thách'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. GỢI Ý CÁCH LÀM (tối đa 3 mức cho mỗi câu, lưu lại để người giao bài xem)
-- ---------------------------------------------------------------------
create table if not exists public.hint_log (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,
  level         int not null check (level between 1 and 3),
  hint          text not null,
  created_at    timestamptz not null default now(),
  unique (submission_id, question_id, level)
);

create or replace function public.save_hint(p_submission uuid, p_question uuid, p_hint text) returns int
language plpgsql security definer set search_path = public as $$
declare v_level int;
begin
  if not exists (
    select 1 from public.submissions s join public.questions q on q.assignment_id = s.assignment_id
     where s.id = p_submission and s.student_id = auth.uid() and s.status = 'in_progress' and q.id = p_question
  ) then
    raise exception 'Chỉ xin gợi ý được khi đang làm bài';
  end if;
  select count(*) + 1 into v_level from public.hint_log where submission_id = p_submission and question_id = p_question;
  if v_level > 3 then raise exception 'Em đã dùng hết 3 gợi ý cho câu này'; end if;
  insert into public.hint_log (submission_id, question_id, level, hint)
  values (p_submission, p_question, v_level, left(coalesce(p_hint, ''), 2000));
  return v_level;
end $$;

-- ---------------------------------------------------------------------
-- 6. PHÂN QUYỀN
-- ---------------------------------------------------------------------
alter table public.star_events enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_requests enable row level security;
alter table public.tasks enable row level security;
alter table public.hint_log enable row level security;

drop policy if exists "stars_read" on public.star_events;
create policy "stars_read" on public.star_events for select to authenticated
  using (public.can_access_student(student_id));

drop policy if exists "rewards_read" on public.rewards;
create policy "rewards_read" on public.rewards for select to authenticated
  using (teacher_id = auth.uid() or (active and teacher_id = public.my_teacher_id()) or public.is_admin());
drop policy if exists "rewards_write" on public.rewards;
create policy "rewards_write" on public.rewards for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid() and public.my_role() = 'teacher');

drop policy if exists "reward_requests_read" on public.reward_requests;
create policy "reward_requests_read" on public.reward_requests for select to authenticated
  using (public.can_access_student(student_id));

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select to authenticated
  using (public.can_access_student(student_id));

drop policy if exists "hint_log_read" on public.hint_log;
create policy "hint_log_read" on public.hint_log for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id
                 and (s.student_id = auth.uid() or public.owns_assignment(s.assignment_id) or public.is_admin())));

grant select on public.star_events, public.reward_requests, public.tasks, public.hint_log to authenticated;
grant select, insert, update, delete on public.rewards to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_time_limit(uuid, int)', 'public.add_extra_time(uuid, int)', 'public.give_stars(uuid, int, text)',
    'public.request_reward(uuid)', 'public.decide_reward(uuid, boolean)', 'public.assign_task(uuid, text, text, int)',
    'public.mark_task_done(uuid)', 'public.confirm_task(uuid, boolean)', 'public.delete_task(uuid)',
    'public.save_hint(uuid, uuid, text)', 'public.star_balance(uuid)', 'public.submission_deadline(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
