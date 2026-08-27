-- 합주/활동로그 변경을 클라이언트가 Realtime으로 받도록 publication에 추가
-- Supabase SQL Editor에서 한 번 실행

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rehearsals'
  ) then
    alter publication supabase_realtime add table public.rehearsals;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_logs'
  ) then
    alter publication supabase_realtime add table public.activity_logs;
  end if;
end $$;
