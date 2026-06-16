alter table public.communities
  add column description text,
  add column is_football_tournament boolean not null default false;
