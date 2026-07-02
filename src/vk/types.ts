export type VkPeerType = 'user' | 'chat' | 'group' | 'email';

export type VkPeer = {
  id: number;
  type: VkPeerType;
  local_id?: number;
};

export type VkMessage = {
  id: number;
  date: number;
  peer_id: number;
  from_id: number;
  out: 0 | 1;
  text: string;
  conversation_message_id: number;
  important?: boolean;
  random_id?: number;
  reply_message?: VkMessage;
  attachments?: unknown[];
  [key: string]: unknown;
};

export type VkChatPhoto = {
  photo_50?: string;
  photo_100?: string;
  photo_200?: string;
};

export type VkChatSettings = {
  title?: string;
  photo?: VkChatPhoto;
};

export type VkConversation = {
  peer: VkPeer;
  in_read: number;
  out_read: number;
  unread_count: number;
  in_read_cmid?: number;
  out_read_cmid?: number;
  last_message_id?: number;
  last_conversation_message_id?: number;
  chat_settings?: VkChatSettings;
};

export type VkConversationItem = {
  conversation: VkConversation;
  last_message?: VkMessage;
};

export type VkProfile = {
  id: number;
  first_name: string;
  last_name: string;
  [key: string]: unknown;
};

export type VkGroup = {
  id: number;
  name: string;
  [key: string]: unknown;
};

export type VkGetConversationsResponse = {
  count: number;
  items: VkConversationItem[];
  profiles?: VkProfile[];
  groups?: VkGroup[];
};

export type VkGetHistoryResponse = {
  count: number;
  items: VkMessage[];
  profiles?: VkProfile[];
  groups?: VkGroup[];
  conversations?: VkConversationItem[];
};

export type VkApiErrorResponse = {
  error: {
    error_code: number;
    error_msg: string;
  };
};
