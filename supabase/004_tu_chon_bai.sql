-- =====================================================================
--  GÓC HỌC TẬP – Nâng cấp 4: em TỰ CHỌN MÔN để lấy bài khi hôm nay không có bài
--  Chạy SAU schema.sql, 002_nang_cap.sql, 003_thuong_phat.sql (chạy lại nhiều lần vẫn an toàn).
--
--  Cách chạy: em chọn môn trên trang → Edge Function "ai" kiểm tra, nhờ AI soạn đề,
--  rồi gọi create_self_assignment bằng khoá service_role. Học sinh KHÔNG gọi thẳng được
--  các hàm dưới đây (để em không tự chèn câu hỏi/đáp án của mình rồi lấy sao).
-- =====================================================================

alter table public.assignments add column if not exists self_chosen boolean not null default false;

-- Số bài em được tự lấy mỗi ngày
create or replace function public.self_assign_daily_limit() returns int
language sql immutable as $$ select 2 $$;

-- Trả về lý do KHÔNG cho lấy bài (null = được lấy)
create or replace function public.self_assign_block_reason(p_student uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_role    text;
  v_teacher uuid;
  v_today   date := (now() at time zone interval '+07:00')::date;
begin
  select role, teacher_id into v_role, v_teacher from public.profiles where id = p_student;
  if v_role is distinct from 'student' then
    return 'Chỉ học sinh mới tự lấy bài được.';
  end if;
  if v_teacher is null then
    return 'Em chưa có người giao bài nên chưa lấy bài được.';
  end if;
  if exists (select 1 from public.assignments a
              where a.student_id = p_student and a.published
                and not exists (select 1 from public.submissions s
                                 where s.assignment_id = a.id and s.status <> 'in_progress')) then
    return 'Em còn bài chưa làm xong. Làm xong bài đó rồi lấy thêm nhé!';
  end if;
  if (select count(*) from public.assignments a
       where a.student_id = p_student and a.self_chosen
         and (a.created_at at time zone interval '+07:00')::date = v_today) >= public.self_assign_daily_limit() then
    return format('Hôm nay em đã tự lấy %s bài rồi. Mai em lấy tiếp nhé!', public.self_assign_daily_limit());
  end if;
  return null;
end $$;

-- Tạo bài em tự chọn: giao luôn cho em, hạn nộp cuối ngày hôm nay (giờ Việt Nam)
-- p = {title, subject, instructions, questions:[{type, prompt, options, accepted, explanation, points}]}
create or replace function public.create_self_assignment(p_student uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reason  text;
  v_teacher uuid;
  v_id      uuid;
  v_q       jsonb;
  v_type    text;
  v_pos     int := 0;
  v_opts    jsonb;
  v_acc     text[];
  v_qid     uuid;
begin
  -- 2 lần bấm cùng lúc không vượt được giới hạn
  perform pg_advisory_xact_lock(hashtext('self_assign:' || p_student::text));
  v_reason := public.self_assign_block_reason(p_student);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;
  select teacher_id into v_teacher from public.profiles where id = p_student;
  if coalesce(btrim(p ->> 'title'), '') = '' then
    raise exception 'Bài tập cần có tên';
  end if;
  if jsonb_typeof(p -> 'questions') is distinct from 'array' or jsonb_array_length(p -> 'questions') = 0 then
    raise exception 'Bài tập cần ít nhất 1 câu hỏi';
  end if;

  insert into public.assignments (teacher_id, student_id, title, subject, instructions, due_at, published, self_chosen)
  values (v_teacher, p_student, left(btrim(p ->> 'title'), 200),
          coalesce(nullif(btrim(p ->> 'subject'), ''), 'Khác'),
          coalesce(p ->> 'instructions', ''),
          ((now() at time zone interval '+07:00')::date + 1)::timestamp at time zone interval '+07:00' - interval '1 second',
          true, true)
  returning id into v_id;

  for v_q in select value from jsonb_array_elements(p -> 'questions') loop
    v_pos  := v_pos + 1;
    v_type := v_q ->> 'type';
    v_opts := coalesce(v_q -> 'options', '[]'::jsonb);
    v_acc  := array(select btrim(x) from jsonb_array_elements_text(coalesce(v_q -> 'accepted', '[]'::jsonb)) x
                    where btrim(x) <> '');
    if v_type not in ('mcq', 'short', 'essay') then
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
        raise exception 'Câu %: chưa có phương án đúng', v_pos;
      end if;
    elsif v_type = 'short' and cardinality(v_acc) = 0 then
      raise exception 'Câu %: chưa có đáp án đúng', v_pos;
    end if;

    insert into public.questions (assignment_id, position, type, prompt, options, points)
    values (v_id, v_pos, v_type, btrim(v_q ->> 'prompt'),
            case when v_type = 'mcq' then v_opts else '[]'::jsonb end,
            least(greatest(coalesce(nullif(v_q ->> 'points', '')::numeric, 1), 0), 5))
    returning id into v_qid;

    insert into public.question_keys (question_id, accepted, explanation)
    values (v_qid, case when v_type in ('mcq', 'short') then v_acc else '{}' end, coalesce(v_q ->> 'explanation', ''));
  end loop;

  return v_id;
end $$;

-- Chỉ máy chủ (service_role, trong Edge Function) gọi được
do $$
declare f text;
begin
  foreach f in array array['public.self_assign_block_reason(uuid)', 'public.create_self_assignment(uuid, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
