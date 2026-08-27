-- 곡 리스트 순서 변경
-- Supabase SQL Editor에서 실행

create or replace function public.reorder_songs(
  p_session_token uuid,
  p_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_order integer := 0;
begin
  perform public.assert_valid_session(p_session_token);

  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception '순서를 지정해 주세요.';
  end if;

  foreach v_id in array p_ids loop
    v_order := v_order + 10;
    update songs set sort_order = v_order, updated_at = now() where id = v_id;
  end loop;
end;
$$;

grant execute on function public.reorder_songs(uuid, uuid[]) to anon, authenticated;
