create or replace function public.upsert_community_bundle(
  p_search_query text,
  p_community jsonb,
  p_contacts jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = sales, public
as $$
begin
  return sales.upsert_community_bundle(p_search_query, p_community, p_contacts);
end;
$$;

grant execute on function public.upsert_community_bundle(text, jsonb, jsonb) to service_role;
grant execute on function public.upsert_community_bundle(text, jsonb, jsonb) to authenticated;
