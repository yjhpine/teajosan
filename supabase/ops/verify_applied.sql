-- 적용 여부 확인 (읽기 전용)
-- Supabase SQL Editor에서 실행 후 결과를 확인하세요.
-- false / 0 이면 해당 마이그레이션을 아직 실행해야 합니다.

select
  to_regprocedure('public.login(text,text,text,text)') is not null as has_login_name_pin,
  to_regprocedure('public.signup(text,text,text,text[],text,text)') is not null as has_signup,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = 'sessions'
  ) as members_has_sessions,
  exists (
    select 1 from pg_constraint where conname = 'members_name_unique'
  ) as members_name_unique,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions' and column_name = 'member_id'
  ) as sessions_has_member_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'devices' and column_name = 'member_id'
  ) as devices_has_member_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'band_roster' and column_name = 'member_id'
  ) as band_roster_has_member_id,
  exists (
    select 1 from pg_constraint where conname = 'sessions_member_id_fkey'
  ) as sessions_fk_cascade,
  exists (
    select 1 from pg_constraint where conname = 'devices_member_id_fkey'
  ) as devices_fk_cascade,
  exists (
    select 1 from pg_constraint where conname = 'band_roster_member_id_fkey'
  ) as band_roster_fk_cascade,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_song'
      and pg_get_functiondef(p.oid) like '%created_by_name%'
  ) as delete_song_owner_guard,
  exists (
    select 1 from pg_trigger where tgname = 'member_deleted_clear_songs'
  ) as member_delete_clears_songs;
