-- 같은 날짜·겹치는 시간대 합주 중복 등록 방지 (동시 요청 포함)
create extension if not exists btree_gist;

create or replace function public.hhmm_to_minutes(t text)
returns integer
language sql
immutable
as $$
  select split_part(t, ':', 1)::integer * 60
       + coalesce(nullif(split_part(t, ':', 2), '')::integer, 0);
$$;

alter table public.rehearsals
  add column if not exists time_span int4range
  generated always as (
    int4range(
      public.hhmm_to_minutes(start_time),
      public.hhmm_to_minutes(end_time),
      '[)'
    )
  ) stored;

alter table public.rehearsals
  drop constraint if exists rehearsals_no_overlap_excl;

alter table public.rehearsals
  add constraint rehearsals_no_overlap_excl
  exclude using gist (
    date with =,
    time_span with &&
  );
