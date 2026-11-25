-- =====================================================================
--  GÓC HỌC TẬP – Cơ sở dữ liệu (dán toàn bộ file này vào Supabase → SQL Editor → Run)
--  Chạy lại nhiều lần được (an toàn): bảng có sẵn sẽ được giữ nguyên.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BẢNG
-- ---------------------------------------------------------------------

-- Hồ sơ người dùng: 'teacher' = người giao bài, 'student' = học sinh
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        text not null check (role in ('teacher', 'student')),
  teacher_id  uuid references public.profiles(id) on delete set null,
  invite_code text unique,
  created_at  timestamptz not null default now()
);

-- Bài tập
create table if not exists public.assignments (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  subject      text not null default 'Khác',
  instructions text not null default '',
  due_at       timestamptz,
  published    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Câu hỏi. type: mcq = trắc nghiệm, short = điền đáp án, essay = tự luận, photo = nộp ảnh
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  position      int not null default 0,
  type          text not null check (type in ('mcq', 'short', 'essay', 'photo')),
  prompt        text not null,
  options       jsonb not null default '[]'::jsonb,
  points        numeric(6,2) not null default 1 check (points >= 0)
);

-- Đáp án tách riêng để học sinh KHÔNG đọc được trước khi bài được trả.
-- mcq: accepted = {'<chỉ số phương án đúng, bắt đầu từ 0>'}; short: các đáp án chấp nhận
create table if not exists public.question_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  accepted    text[] not null default '{}',
  explanation text not null default ''
);

-- Bài làm của học sinh. status: in_progress → submitted (chờ chấm) → returned (đã trả bài)
create table if not exists public.submissions (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.assignments(id) on delete cascade,
  student_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status          text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'returned')),
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  returned_at     timestamptz,
  score           numeric(7,2),
  max_score       numeric(7,2),
  teacher_comment text not null default '',
  unique (assignment_id, student_id)
);

-- Câu trả lời từng câu
create table if not exists public.answers (
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  answer_text    text not null default '',
  image_paths    text[] not null default '{}',
  is_correct     boolean,
  points_awarded numeric(6,2),
  feedback       text not null default '',
  updated_at     timestamptz not null default now(),
  primary key (submission_id, question_id)
);

create index if not exists assignments_teacher_idx on public.assignments(teacher_id);
create index if not exists assignments_student_idx on public.assignments(student_id);
create index if not exists questions_assignment_idx on public.questions(assignment_id);
create index if not exists submissions_assignment_idx on public.submissions(assignment_id);

-- ---------------------------------------------------------------------
-- 2. HÀM TIỆN ÍCH (security definer để tránh vòng lặp RLS)
-- ---------------------------------------------------------------------

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select teacher_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_my_student(p_student text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id::text = p_student and teacher_id = auth.uid())
$$;

create or replace function public.owns_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments where id = p_assignment and teacher_id = auth.uid())
$$;

create or replace function public.assigned_to_me(p_assignment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments
                 where id = p_assignment and student_id = auth.uid() and published)
$$;

create or replace function public.returned_to_me(p_assignment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.submissions
                 where assignment_id = p_assignment and student_id = auth.uid() and status = 'returned')
$$;

-- Chuẩn hoá câu trả lời: bỏ khoảng trắng thừa, chữ thường, Unicode NFC (gõ Telex/VNI khác nhau vẫn khớp)
create or replace function public.norm_answer(t text) returns text
language sql immutable as $$
  select regexp_replace(lower(normalize(btrim(coalesce(t, '')), NFC)), '\s+', ' ', 'g')
$$;

-- Chấm 1 câu tự động. Số được so theo giá trị: "2,5" = "2.5" = "2.50"
create or replace function public.check_answer(p_type text, p_answer text, p_accepted text[]) returns boolean
language plpgsql immutable as $$
declare
  a   text := public.norm_answer(p_answer);
  x   text;
  num text := '^-?[0-9]+([.,][0-9]+)?$';
begin
  if a = '' then return false; end if;
  if p_type = 'mcq' then
    return a = public.norm_answer(p_accepted[1]);
  end if;
  foreach x in array coalesce(p_accepted, '{}') loop
    if public.norm_answer(x) = a then return true; end if;
    if a ~ num and public.norm_answer(x) ~ num
       and replace(a, ',', '.')::numeric = replace(public.norm_answer(x), ',', '.')::numeric then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 3. TẠO HỒ SƠ KHI ĐĂNG KÝ
-- ---------------------------------------------------------------------

create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role    text := coalesce(new.raw_user_meta_data ->> 'role', 'student');
  v_name    text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  v_code    text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
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
    insert into public.profiles (id, full_name, role, teacher_id)
    values (new.id, v_name, 'student', v_teacher);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Kiểm tra mã mời trước khi đăng ký (trả về tên người giao bài, hoặc null)
create or replace function public.check_invite_code(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select full_name from public.profiles
  where role = 'teacher' and invite_code = upper(btrim(p_code))
$$;

-- ---------------------------------------------------------------------
-- 4. CÁC THAO TÁC (RPC) – mọi thao tác ghi đều đi qua đây để kiểm soát chặt
-- ---------------------------------------------------------------------

-- Người giao bài: tạo mới / sửa bài tập kèm toàn bộ câu hỏi (một lần, nguyên khối)
create or replace function public.save_assignment(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid := nullif(p ->> 'id', '')::uuid;
  v_student uuid := nullif(p ->> 'student_id', '')::uuid;
  v_q       jsonb;
  v_qid     uuid;
  v_type    text;
  v_pos     int := 0;
  v_opts    jsonb;
  v_acc     text[];
begin
  if public.my_role() is distinct from 'teacher' then
    raise exception 'Chỉ người giao bài mới tạo được bài tập';
  end if;
  if v_student is null or not public.is_my_student(v_student::text) then
    raise exception 'Hãy chọn học sinh nhận bài';
  end if;
  if coalesce(btrim(p ->> 'title'), '') = '' then
    raise exception 'Bài tập cần có tên';
  end if;
  if jsonb_typeof(p -> 'questions') is distinct from 'array' or jsonb_array_length(p -> 'questions') = 0 then
    raise exception 'Bài tập cần ít nhất 1 câu hỏi';
  end if;

  if v_id is null then
    insert into public.assignments (teacher_id, student_id, title, subject, instructions, due_at, published)
    values (auth.uid(), v_student, btrim(p ->> 'title'),
            coalesce(nullif(btrim(p ->> 'subject'), ''), 'Khác'),
            coalesce(p ->> 'instructions', ''),
            nullif(p ->> 'due_at', '')::timestamptz,
            coalesce((p ->> 'published')::boolean, false))
    returning id into v_id;
  else
    if not public.owns_assignment(v_id) then
      raise exception 'Không tìm thấy bài tập';
    end if;
    if exists (select 1 from public.submissions where assignment_id = v_id) then
      raise exception 'Em đã bắt đầu làm bài này nên không sửa được nữa. Hãy bấm "Nhân bản" để tạo bài mới.';
    end if;
    update public.assignments
       set student_id   = v_student,
           title        = btrim(p ->> 'title'),
           subject      = coalesce(nullif(btrim(p ->> 'subject'), ''), 'Khác'),
           instructions = coalesce(p ->> 'instructions', ''),
           due_at       = nullif(p ->> 'due_at', '')::timestamptz,
           published    = coalesce((p ->> 'published')::boolean, false)
     where id = v_id;
    delete from public.questions where assignment_id = v_id;
  end if;

  for v_q in select value from jsonb_array_elements(p -> 'questions') loop
    v_pos  := v_pos + 1;
    v_type := v_q ->> 'type';
    v_opts := coalesce(v_q -> 'options', '[]'::jsonb);
    v_acc  := array(select btrim(x) from jsonb_array_elements_text(coalesce(v_q -> 'accepted', '[]'::jsonb)) x
                    where btrim(x) <> '');

    if v_type not in ('mcq', 'short', 'essay', 'photo') then
      raise exception 'Câu %: loại câu hỏi không hợp lệ', v_pos;
    end if;
    if coalesce(btrim(v_q ->> 'prompt'), '') = '' then
      raise exception 'Câu %: chưa có nội dung câu hỏi', v_pos;
    end if;
    if v_type = 'mcq' then
      if jsonb_array_length(v_opts) < 2 then
        raise exception 'Câu %: trắc nghiệm cần ít nhất 2 phương án', v_pos;
      end if;
      if cardinality(v_acc) <> 1 or v_acc[1] !~ '^[0-9]+$' or v_acc[1]::int >= jsonb_array_length(v_opts) then
        raise exception 'Câu %: hãy chọn phương án đúng', v_pos;
      end if;
    elsif v_type = 'short' and cardinality(v_acc) = 0 then
      raise exception 'Câu %: hãy nhập ít nhất 1 đáp án đúng', v_pos;
    end if;

    insert into public.questions (assignment_id, position, type, prompt, options, points)
    values (v_id, v_pos, v_type, btrim(v_q ->> 'prompt'),
            case when v_type = 'mcq' then v_opts else '[]'::jsonb end,
            greatest(coalesce(nullif(v_q ->> 'points', '')::numeric, 1), 0))
    returning id into v_qid;

    insert into public.question_keys (question_id, accepted, explanation)
    values (v_qid,
            case when v_type in ('mcq', 'short') then v_acc else '{}' end,
            coalesce(v_q ->> 'explanation', ''));
  end loop;

  return v_id;
end $$;

-- Học sinh: mở bài để làm (tạo bài làm nếu chưa có), trả về id bài làm
create or replace function public.start_submission(p_assignment uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.assigned_to_me(p_assignment) then
    raise exception 'Không tìm thấy bài tập';
  end if;
  insert into public.submissions (assignment_id, student_id)
  values (p_assignment, auth.uid())
  on conflict (assignment_id, student_id) do nothing;
  select id into v_id from public.submissions
   where assignment_id = p_assignment and student_id = auth.uid();
  return v_id;
end $$;

-- Học sinh: lưu câu trả lời (tự lưu khi đang làm)
create or replace function public.save_answer(p_submission uuid, p_question uuid, p_text text, p_images text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := auth.uid()::text || '/' || p_submission::text || '/';
begin
  if not exists (
    select 1 from public.submissions s
      join public.questions q on q.assignment_id = s.assignment_id
     where s.id = p_submission and s.student_id = auth.uid()
       and s.status = 'in_progress' and q.id = p_question
  ) then
    raise exception 'Bài đã nộp hoặc không hợp lệ nên không lưu được';
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

-- Học sinh: nộp bài. Tự chấm trắc nghiệm + điền đáp án.
-- Nếu bài không có câu tự luận/ảnh → trả bài ngay; ngược lại chờ người giao bài chấm.
create or replace function public.submit_submission(p_submission uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_s      public.submissions;
  v_manual int;
  v_status text;
begin
  select * into v_s from public.submissions
   where id = p_submission and student_id = auth.uid()
   for update;
  if not found then
    raise exception 'Không tìm thấy bài làm';
  end if;
  if v_s.status <> 'in_progress' then
    return v_s.status;
  end if;

  insert into public.answers (submission_id, question_id)
  select p_submission, q.id from public.questions q where q.assignment_id = v_s.assignment_id
  on conflict do nothing;

  update public.answers a
     set is_correct     = public.check_answer(q.type, a.answer_text, k.accepted),
         points_awarded = case when public.check_answer(q.type, a.answer_text, k.accepted) then q.points else 0 end
    from public.questions q
    join public.question_keys k on k.question_id = q.id
   where a.submission_id = p_submission
     and a.question_id = q.id
     and q.type in ('mcq', 'short');

  select count(*) into v_manual from public.questions
   where assignment_id = v_s.assignment_id and type in ('essay', 'photo');

  update public.submissions
     set status       = case when v_manual = 0 then 'returned' else 'submitted' end,
         submitted_at = now(),
         returned_at  = case when v_manual = 0 then now() end,
         max_score    = (select coalesce(sum(points), 0) from public.questions where assignment_id = v_s.assignment_id),
         score        = (select coalesce(sum(points_awarded), 0) from public.answers where submission_id = p_submission)
   where id = p_submission
  returning status into v_status;

  return v_status;
end $$;

-- Người giao bài: chấm điểm, nhận xét và trả bài.
-- p_grades = [{"question_id": "...", "points": 1, "feedback": "..."}]
create or replace function public.return_submission(p_submission uuid, p_grades jsonb, p_comment text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s public.submissions;
  g   jsonb;
begin
  select s.* into v_s from public.submissions s
   where s.id = p_submission and public.owns_assignment(s.assignment_id)
   for update;
  if not found then
    raise exception 'Không tìm thấy bài làm';
  end if;
  if v_s.status = 'in_progress' then
    raise exception 'Em chưa nộp bài này';
  end if;

  for g in select value from jsonb_array_elements(coalesce(p_grades, '[]'::jsonb)) loop
    update public.answers a
       set points_awarded = case
                              when nullif(btrim(g ->> 'points'), '') is null then a.points_awarded  -- để trống = giữ nguyên
                              else least(greatest((g ->> 'points')::numeric, 0), q.points)
                            end,
           feedback       = coalesce(g ->> 'feedback', a.feedback)
      from public.questions q
     where a.submission_id = p_submission
       and a.question_id = (g ->> 'question_id')::uuid
       and q.id = a.question_id;
  end loop;

  if exists (select 1 from public.answers where submission_id = p_submission and points_awarded is null) then
    raise exception 'Còn câu chưa cho điểm';
  end if;

  update public.answers a
     set is_correct = a.points_awarded >= q.points
    from public.questions q
   where a.submission_id = p_submission and q.id = a.question_id;

  update public.submissions
     set status          = 'returned',
         returned_at     = now(),
         teacher_comment = coalesce(p_comment, ''),
         score           = (select coalesce(sum(points_awarded), 0) from public.answers where submission_id = p_submission)
   where id = p_submission;
end $$;

-- ---------------------------------------------------------------------
-- 5. PHÂN QUYỀN (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.assignments   enable row level security;
alter table public.questions     enable row level security;
alter table public.question_keys enable row level security;
alter table public.submissions   enable row level security;
alter table public.answers       enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select to authenticated
  using (id = auth.uid() or teacher_id = auth.uid() or id = public.my_teacher_id());

drop policy if exists "assignments_read" on public.assignments;
create policy "assignments_read" on public.assignments for select to authenticated
  using (teacher_id = auth.uid() or (student_id = auth.uid() and published));

drop policy if exists "assignments_delete" on public.assignments;
create policy "assignments_delete" on public.assignments for delete to authenticated
  using (teacher_id = auth.uid());

drop policy if exists "questions_read" on public.questions;
create policy "questions_read" on public.questions for select to authenticated
  using (public.owns_assignment(assignment_id) or public.assigned_to_me(assignment_id));

drop policy if exists "keys_read" on public.question_keys;
create policy "keys_read" on public.question_keys for select to authenticated
  using (exists (select 1 from public.questions q
                 where q.id = question_id
                   and (public.owns_assignment(q.assignment_id) or public.returned_to_me(q.assignment_id))));

drop policy if exists "submissions_read" on public.submissions;
create policy "submissions_read" on public.submissions for select to authenticated
  using (student_id = auth.uid() or public.owns_assignment(assignment_id));

drop policy if exists "answers_read" on public.answers;
create policy "answers_read" on public.answers for select to authenticated
  using (exists (select 1 from public.submissions s
                 where s.id = submission_id
                   and (s.student_id = auth.uid() or public.owns_assignment(s.assignment_id))));

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.assignments, public.questions,
                public.question_keys, public.submissions, public.answers to authenticated;
grant delete on public.assignments to authenticated;

revoke execute on function public.save_assignment(jsonb)                      from public, anon;
revoke execute on function public.start_submission(uuid)                      from public, anon;
revoke execute on function public.save_answer(uuid, uuid, text, text[])       from public, anon;
revoke execute on function public.submit_submission(uuid)                     from public, anon;
revoke execute on function public.return_submission(uuid, jsonb, text)        from public, anon;
grant  execute on function public.save_assignment(jsonb)                      to authenticated;
grant  execute on function public.start_submission(uuid)                      to authenticated;
grant  execute on function public.save_answer(uuid, uuid, text, text[])       to authenticated;
grant  execute on function public.submit_submission(uuid)                     to authenticated;
grant  execute on function public.return_submission(uuid, jsonb, text)        to authenticated;
grant  execute on function public.check_invite_code(text)                     to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. KHO ẢNH BÀI LÀM (riêng tư). Đường dẫn: <id học sinh>/<id bài làm>/<tên file>
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('bai-lam', 'bai-lam', false)
on conflict (id) do nothing;

drop policy if exists "bai_lam_upload" on storage.objects;
create policy "bai_lam_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'bai-lam' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "bai_lam_read" on storage.objects;
create policy "bai_lam_read" on storage.objects for select to authenticated
  using (bucket_id = 'bai-lam'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.is_my_student((storage.foldername(name))[1])));

drop policy if exists "bai_lam_delete" on storage.objects;
create policy "bai_lam_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'bai-lam' and (storage.foldername(name))[1] = auth.uid()::text);
