create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.communities (
  id bigint generated always as identity primary key,

  url text not null,
  name text,
  phone text,
  site text,
  msg_url text,
  peer_id bigint,
  last_post_date timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint communities_url_not_empty
    check (char_length(trim(url)) > 0),
  constraint communities_url_unique
    unique (url),
  constraint communities_peer_id_unique
    unique (peer_id)
);

create index communities_last_post_date_idx
  on public.communities (last_post_date desc nulls last);

create index communities_peer_id_idx
  on public.communities (peer_id)
  where peer_id is not null;

create trigger communities_set_updated_at
  before update on public.communities
  for each row
  execute function public.set_updated_at();
