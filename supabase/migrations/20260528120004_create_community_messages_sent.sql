drop function if exists public.mark_community_message_sent(bigint, bigint, text);
drop function if exists public.get_pending_message_communities(integer);
drop table if exists public.community_messages_sent;

create table public.community_messages_sent (
  id bigint generated always as identity primary key,
  community_id bigint references public.communities (id) on delete set null,
  chat_id bigint not null,
  msg_url text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint community_messages_sent_chat_id_unique
    unique (chat_id),
  constraint community_messages_sent_msg_url_unique
    unique (msg_url),
  constraint community_messages_sent_msg_url_not_empty
    check (msg_url is null or char_length(trim(msg_url)) > 0)
);

create index if not exists community_messages_sent_community_id_idx
  on public.community_messages_sent (community_id);

create index if not exists community_messages_sent_sent_at_idx
  on public.community_messages_sent (sent_at desc);

create or replace function public.get_pending_message_communities(
  p_limit integer
)
returns table (
  id bigint,
  url text,
  name text,
  phone text,
  site text,
  msg_url text,
  peer_id bigint,
  last_post_date timestamptz
)
language sql
stable
as $$
  select
    c.id,
    c.url,
    c.name,
    c.phone,
    c.site,
    c.msg_url,
    c.peer_id,
    c.last_post_date
  from public.communities c
  where c.msg_url is not null
    and char_length(trim(c.msg_url)) > 0
    and c.peer_id is not null
    and not exists (
      select 1
      from public.community_messages_sent sent
      where sent.chat_id = c.peer_id
    )
  order by c.last_post_date desc nulls last, c.id
  limit greatest(coalesce(p_limit, 0), 0);
$$;

create or replace function public.mark_community_message_sent(
  p_community_id bigint,
  p_chat_id bigint,
  p_msg_url text
)
returns bigint
language plpgsql
as $$
declare
  v_sent_id bigint;
begin
  if p_chat_id is null then
    raise exception 'chat id is required';
  end if;

  insert into public.community_messages_sent (
    community_id,
    chat_id,
    msg_url
  )
  values (
    p_community_id,
    p_chat_id,
    nullif(trim(p_msg_url), '')
  )
  on conflict (chat_id) do update set
    community_id = coalesce(excluded.community_id, public.community_messages_sent.community_id),
    msg_url = coalesce(excluded.msg_url, public.community_messages_sent.msg_url)
  returning id into v_sent_id;

  return v_sent_id;
end;
$$;

