create type public.community_source as enum ('vk');

alter table public.communities
  add column source public.community_source not null default 'vk';
