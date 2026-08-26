-- Drop unused rehearsal place/note columns
alter table rehearsals drop column if exists place;
alter table rehearsals drop column if exists note;
