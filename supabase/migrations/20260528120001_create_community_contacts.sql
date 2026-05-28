create table sales.community_contacts (
  id bigint generated always as identity primary key,

  community_id bigint not null
    references sales.communities (id)
    on delete cascade,

  full_name text,
  profile_url text not null,
  description text,
  phone text,
  email text,
  is_active boolean not null default true,
  deactivated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_contacts_profile_url_not_empty
    check (char_length(trim(profile_url)) > 0),
  constraint community_contacts_community_profile_unique
    unique (community_id, profile_url)
);

create index community_contacts_community_id_idx
  on sales.community_contacts (community_id);

create index community_contacts_active_idx
  on sales.community_contacts (community_id, is_active)
  where is_active = true;

create index community_contacts_email_idx
  on sales.community_contacts (email)
  where email is not null;

create index community_contacts_phone_idx
  on sales.community_contacts (phone)
  where phone is not null;

create trigger community_contacts_set_updated_at
  before update on sales.community_contacts
  for each row
  execute function sales.set_updated_at();
