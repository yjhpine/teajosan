-- 쓰기/인증 RPC를 anon·authenticated에서 회수 → Edge gateway(service_role)만 호출
-- 선행: supabase functions deploy gateway
-- Supabase SQL Editor에서 실행

do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'login',
        'signup',
        'validate_session',
        'logout',
        'touch_device',
        'get_my_profile',
        'set_my_sessions',
        'change_my_pin',
        'create_rehearsal',
        'update_rehearsal',
        'delete_rehearsal',
        'create_song',
        'update_song',
        'delete_song',
        'reorder_songs',
        'add_roster_member',
        'create_song_request',
        'claim_song_request_slot',
        'promote_song_request',
        'delete_song_request',
        'create_performance',
        'update_performance',
        'delete_performance'
      )
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      r.nspname, r.proname, r.args
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      r.nspname, r.proname, r.args
    );
  end loop;
end $$;

-- 공개 읽기 RPC는 anon 유지
grant execute on function public.get_app_status() to anon, authenticated;
grant execute on function public.list_member_profiles() to anon, authenticated;

-- 확인: anon이 못 부르는 함수 수
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'login', 'signup', 'validate_session', 'create_rehearsal', 'create_song',
    'get_app_status', 'list_member_profiles'
  )
order by p.proname;
