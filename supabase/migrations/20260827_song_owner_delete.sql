-- 곡 삭제: 본인 등록 곡만 가능 / 수정은 로그인 멤버 전원
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
  v_cohort text;
  v_name text;
  v_deleted integer;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  delete from songs s
  where s.id = p_id
    and s.created_by_cohort = v_cohort
    and s.created_by_name = v_name;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception '본인이 등록한 곡만 삭제할 수 있습니다.';
  end if;
end;
$$;

grant execute on function public.delete_song(uuid, uuid) to anon, authenticated;

-- update_song 은 세션만 있으면하면 전원 수정 가능 (기존 song_list.sql 유지)
