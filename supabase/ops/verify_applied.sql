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
      and pg_get_functiondef(p.oid) not like '%created_by_name%'
  ) as delete_song_any_member,
  exists (
    select 1 from pg_trigger where tgname = 'member_deleted_clear_songs'
  ) as member_delete_clears_songs,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'login_attempts' and column_name = 'attempt_key'
  ) as login_attempts_has_attempt_key,
  to_regprocedure('public.change_my_pin(uuid,text,text)') is not null as has_change_my_pin,
  to_regprocedure('public.reorder_songs(uuid,uuid[])') is not null as has_reorder_songs,
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'members'
  ) as members_in_realtime,
  to_regclass('public.song_requests') is not null as has_song_requests_table,
  to_regprocedure('public.create_song_request(uuid,text,text[],text[],text)') is not null as has_create_song_request,
  to_regprocedure('public.claim_song_request_slot(uuid,uuid,text)') is not null as has_claim_song_request_slot,
  to_regprocedure('public.promote_song_request(uuid,uuid)') is not null as has_promote_song_request,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'song_requests' and column_name = 'needed_slots'
  ) as song_requests_has_needed_slots,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'songs' and column_name = 'youtube_url'
  ) as songs_has_youtube_url,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'song_requests' and column_name = 'youtube_url'
  ) as song_requests_has_youtube_url,
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'song_requests'
  ) as song_requests_in_realtime;
