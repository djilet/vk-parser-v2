import type { VkConversationItem, VkGroup, VkProfile } from './types.js';

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
    const chatId = peer.id - 2_000_000_000;
    return `Беседа #${chatId}`;
  }

  return `peer_${peer.id}`;
}
