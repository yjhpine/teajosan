-- 곡 삭제: 로그인 멤버 전원 가능 (수정과 동일)
-- Supabase SQL Editor에서 실행

create or replace function public.delete_song(
  p_session_token uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  perform public.assert_valid_session(p_session_token);

  delete from songs where id = p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception '곡을 찾을 수 없습니다.';
  end if;
end;
$$;

grant execute on function public.delete_song(uuid, uuid) to anon, authenticated;
