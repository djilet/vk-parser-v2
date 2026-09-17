/** Types mirror docs/imgame-backend-sales-api.md — the backend is the source of truth. */

export type SalesCommunity = {
  id: number;
  url: string;
  name?: string;
  phone?: string;
  site?: string;
  msg_url?: string;
  peer_id?: number | null;
  last_post_date?: string | null;
  is_fraud?: boolean | null;
  source?: 'vk';
  description?: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

export type SalesCommunityContact = {
  id: number;
  community_id: number;
  full_name?: string;
  profile_url: string;
  description?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  deactivated_at?: string | null;
  [key: string]: unknown;
};

export type SalesCommunitySearchQuery = {
  id: number;
  community_id: number;
  search_query: string;
  first_seen_at?: string;
  last_seen_at?: string;
  [key: string]: unknown;
};

export type SalesCommunityMessageSent = {
  id: number;
  community_id?: number | null;
  chat_id: number;
  msg_url?: string | null;
  sent_at?: string;
  [key: string]: unknown;
};

export type SalesMessage = {
  id: number;
  community_id: number;
  vk_message_id: number;
  text: string;
  is_my_message: boolean;
  from_id?: number | null;
  created_at: string;
  [key: string]: unknown;
};
