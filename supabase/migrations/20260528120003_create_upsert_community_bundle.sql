create or replace function sales.upsert_community_bundle(
  p_search_query text,
  p_community jsonb,
  p_contacts jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
as $$
declare
  v_community_id bigint;
  v_contact jsonb;
  v_profile_urls text[];
begin
  if p_community->>'url' is null or char_length(trim(p_community->>'url')) = 0 then
    raise exception 'community url is required';
  end if;

  insert into sales.communities (
    url, name, phone, site, msg_url, peer_id, last_post_date
  )
  values (
    trim(p_community->>'url'),
    nullif(p_community->>'name', ''),
    nullif(p_community->>'phone', ''),
    nullif(p_community->>'site', ''),
    nullif(p_community->>'msg_url', ''),
    case
      when p_community->>'peer_id' is null or p_community->>'peer_id' = '' then null
      else (p_community->>'peer_id')::bigint
    end,
    case
      when p_community->>'last_post_date' is null or p_community->>'last_post_date' = '' then null
      else (p_community->>'last_post_date')::timestamptz
    end
  )
  on conflict (url) do update set
    name = excluded.name,
    phone = excluded.phone,
    site = excluded.site,
    msg_url = excluded.msg_url,
    peer_id = excluded.peer_id,
    last_post_date = excluded.last_post_date,
    updated_at = now()
  returning id into v_community_id;

  if p_search_query is not null and char_length(trim(p_search_query)) > 0 then
    insert into sales.community_search_queries (community_id, search_query)
    values (v_community_id, trim(p_search_query))
    on conflict (community_id, search_query) do update set
      last_seen_at = now();
  end if;

  select coalesce(array_agg(trim(elem->>'profile_url')), array[]::text[])
  into v_profile_urls
  from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) as elem
  where elem->>'profile_url' is not null
    and char_length(trim(elem->>'profile_url')) > 0;

  if coalesce(array_length(v_profile_urls, 1), 0) = 0 then
    update sales.community_contacts
    set
      is_active = false,
      deactivated_at = now(),
      updated_at = now()
    where community_id = v_community_id
      and is_active = true;
  else
    update sales.community_contacts
    set
      is_active = false,
      deactivated_at = now(),
      updated_at = now()
    where community_id = v_community_id
      and is_active = true
      and profile_url <> all(v_profile_urls);
  end if;

  for v_contact in
    select elem
    from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) as elem
    where elem->>'profile_url' is not null
      and char_length(trim(elem->>'profile_url')) > 0
  loop
    insert into sales.community_contacts (
      community_id,
      full_name,
      profile_url,
      description,
      phone,
      email,
      is_active,
      deactivated_at
    )
    values (
      v_community_id,
      nullif(v_contact->>'full_name', ''),
      trim(v_contact->>'profile_url'),
      nullif(v_contact->>'description', ''),
      nullif(v_contact->>'phone', ''),
      nullif(v_contact->>'email', ''),
      true,
      null
    )
    on conflict (community_id, profile_url) do update set
      full_name = excluded.full_name,
      description = excluded.description,
      phone = excluded.phone,
      email = excluded.email,
      is_active = true,
      deactivated_at = null,
      updated_at = now();
  end loop;

  return v_community_id;
end;
$$;
