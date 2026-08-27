-- 로그인 사용자가 본인 PIN 변경
-- Supabase SQL Editor에서 실행

create or replace function public.change_my_pin(
  p_token uuid,
  p_old_pin text,
  p_new_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_cohort text;
  v_name text;
  v_pin_hash text;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_token) s;

  if p_old_pin is null or char_length(p_old_pin) < 4 then
    raise exception '현재 PIN을 입력해 주세요.';
  end if;
  if p_new_pin is null or char_length(p_new_pin) < 4 then
    raise exception '새 PIN은 4자 이상이어야 합니다.';
  end if;

  select m.pin_hash into v_pin_hash
  from public.members m
  where m.cohort = v_cohort and m.name = v_name;

  if v_pin_hash is null then
    raise exception '멤버를 찾을 수 없습니다.';
  end if;

  if crypt(p_old_pin, v_pin_hash) <> v_pin_hash then
    raise exception '현재 PIN이 올바르지 않습니다.';
  end if;

  update public.members m
  set pin_hash = crypt(p_new_pin, gen_salt('bf'))
  where m.cohort = v_cohort and m.name = v_name;
end;
$$;

grant execute on function public.change_my_pin(uuid, text, text) to anon, authenticated;
