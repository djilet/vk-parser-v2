import type { VkConversation, VkMessage } from './types.js';

export type ExportedFile = {
  type: string;
  url: string;
  name?: string;
};

export type ExportedMessage = {
  id?: number;
  date: string;
  fromId: number;
  text: string;
  files: ExportedFile[];
};

type VkAttachment = {
  type: string;
  [key: string]: unknown;
};

const PHOTO_SIZE_PRIORITY = ['w', 'z', 'y', 'x', 'r', 'q', 'p', 'o', 'm', 's'];

function pickLargestPhotoUrl(sizes: { type: string; url: string; width?: number }[] | undefined): string | null {
  if (!sizes?.length) {
    return null;
  }

  for (const sizeType of PHOTO_SIZE_PRIORITY) {
    const match = sizes.find((size) => size.type === sizeType);
    if (match?.url) {
      return match.url;
    }
  }

  const largest = [...sizes].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return largest?.url ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function extractFileLinks(attachments: unknown[] | undefined): ExportedFile[] {
  if (!attachments?.length) {
    return [];
  }

  const files: ExportedFile[] = [];

  for (const attachment of attachments) {
    const item = attachment as VkAttachment;

    switch (item.type) {
      case 'photo': {
        const photo = asRecord(item.photo);
        const sizes = Array.isArray(photo?.sizes)
          ? (photo.sizes as { type: string; url: string; width?: number }[])
          : undefined;
        const url = pickLargestPhotoUrl(sizes);
        if (url) {
          files.push({ type: 'photo', url });
        }
        break;
      }
      case 'doc': {
        const doc = asRecord(item.doc);
        const url = asString(doc?.url);
        if (url) {
          const title = asString(doc?.title);
          const ext = asString(doc?.ext);
          files.push({
            type: 'doc',
            url,
            name: title && ext ? `${title}.${ext}` : title ?? ext,
          });
        }
        break;
      }
      case 'video': {
        const video = asRecord(item.video);
        const url = asString(video?.player) ?? asString(video?.share_url);
        if (url) {
          files.push({ type: 'video', url, name: asString(video?.title) });
        }
        break;
      }
      case 'audio': {
        const audio = asRecord(item.audio);
        const url = asString(audio?.url);
        if (url) {
          const name = [asString(audio?.artist), asString(audio?.title)].filter(Boolean).join(' - ');
          files.push({ type: 'audio', url, name: name || undefined });
        }
        break;
      }
      case 'audio_message': {
        const voice = asRecord(item.audio_message);
        const url = asString(voice?.link_mp3) ?? asString(voice?.link_ogg);
        if (url) {
          files.push({ type: 'audio_message', url });
        }
        break;
      }
      case 'link': {
        const link = asRecord(item.link);
        const url = asString(link?.url);
        if (url) {
          files.push({ type: 'link', url, name: asString(link?.title) });
        }
        break;
      }
      case 'sticker': {
        const sticker = asRecord(item.sticker);
        const images = Array.isArray(sticker?.images)
          ? (sticker.images as { url?: string; width?: number }[])
          : [];
        const url = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
        if (url) {
          files.push({ type: 'sticker', url });
        }
        break;
      }
      case 'wall': {
        const wall = asRecord(item.wall);
        const ownerId = wall?.owner_id;
        const id = wall?.id;
        if (typeof ownerId === 'number' && typeof id === 'number') {
          files.push({ type: 'wall', url: `https://vk.com/wall${ownerId}_${id}` });
        }
        break;
      }
      case 'graffiti': {
        const graffiti = asRecord(item.graffiti);
        const url = asString(graffiti?.url);
        if (url) {
          files.push({ type: 'graffiti', url });
        }
        break;
      }
      default:
        break;
    }
  }

  return files;
}

export function isUnreadIncoming(message: VkMessage, conversation: VkConversation): boolean {
  if (message.out !== 0) {
    return false;
  }

  const inReadCmid = (conversation as VkConversation & { in_read_cmid?: number }).in_read_cmid;
  if (inReadCmid != null) {
    return message.conversation_message_id > inReadCmid;
  }

  return message.id > conversation.in_read;
}

export function formatMessage(message: VkMessage): ExportedMessage {
  return {
    id: message.id,
    date: new Date(message.date * 1000).toISOString(),
    fromId: message.from_id,
    text: message.text ?? '',
    files: extractFileLinks(message.attachments),
  };
}

export function formatMessages(messages: VkMessage[]): ExportedMessage[] {
  return [...messages]
    .sort((a, b) => a.date - b.date || a.id - b.id)
    .map(formatMessage);
}

export function formatUnreadMessages(
  messages: VkMessage[],
  conversation: VkConversation,
): ExportedMessage[] {
  return messages
    .filter((message) => isUnreadIncoming(message, conversation))
    .sort((a, b) => a.date - b.date || a.id - b.id)
    .map(formatMessage);
}
