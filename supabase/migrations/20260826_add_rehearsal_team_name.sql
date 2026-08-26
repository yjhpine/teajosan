-- Add team name column for rehearsals
alter table rehearsals
  add column if not exists team_name text not null default '';
