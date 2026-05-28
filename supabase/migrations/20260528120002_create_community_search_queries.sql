create table sales.community_search_queries (
  community_id bigint not null
    references sales.communities (id)
    on delete cascade,

  search_query text not null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  constraint community_search_queries_query_not_empty
    check (char_length(trim(search_query)) > 0),
  constraint community_search_queries_pkey
    primary key (community_id, search_query)
);

create index community_search_queries_search_query_idx
  on sales.community_search_queries (search_query);

create index community_search_queries_last_seen_at_idx
  on sales.community_search_queries (last_seen_at desc);
