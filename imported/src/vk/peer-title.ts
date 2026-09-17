import type { VkConversationItem, VkGroup, VkProfile } from './types.js';

function pickPhoto100(source: { photo_100?: string; photo?: { photo_100?: string } } | undefined): string | undefined {
  if (!source) {
    return undefined;
  }

  if (source.photo?.photo_100) {
    return source.photo.photo_100;
  }

  return source.photo_100;
}

export function resolvePeerTitle(
  item: VkConversationItem,
  profiles: VkProfile[] = [],
  groups: VkGroup[] = [],
): string {
  const peer = item.conversation.peer;

  if (peer.type === 'user') {
    const profile = profiles.find((entry) => entry.id === peer.id);
    if (profile) {
      return `${profile.first_name} ${profile.last_name}`.trim();
    }
  }

  if (peer.type === 'group') {
    const group = groups.find((entry) => entry.id === Math.abs(peer.id));
    if (group) {
      return group.name;
    }
  }

  if (peer.type === 'chat') {
    const title = item.conversation.chat_settings?.title;
    if (title) {
      return title;
    }

    const chatId = peer.id - 2_000_000_000;
    return `Беседа #${chatId}`;
  }

  return `peer_${peer.id}`;
}

export function resolvePeerPhotoUrl(
  item: VkConversationItem,
  profiles: VkProfile[] = [],
  groups: VkGroup[] = [],
): string | undefined {
  const peer = item.conversation.peer;

  if (peer.type === 'user') {
    const profile = profiles.find((entry) => entry.id === peer.id);
    return pickPhoto100(profile as VkProfile & { photo_100?: string });
  }

  if (peer.type === 'group') {
    const group = groups.find((entry) => entry.id === Math.abs(peer.id));
    return pickPhoto100(group as VkGroup & { photo_100?: string });
  }

  if (peer.type === 'chat') {
    return item.conversation.chat_settings?.photo?.photo_100;
  }

  return undefined;
}
