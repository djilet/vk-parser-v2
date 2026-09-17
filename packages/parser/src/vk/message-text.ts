type VkAttachmentLike = { type: string; [key: string]: unknown };
type VkMessageLike = {
  text?: string | null;
  // unknown[], not VkAttachmentLike[] — VK's own message type (packages/core) declares
  // attachments as unknown[], so this stays structurally assignable from either shape.
  attachments?: unknown[];
  reply_message?: VkMessageLike;
  fwd_messages?: VkMessageLike[];
};

/**
 * Крупнейший по ширине вариант картинки из массива sizes/images VK. У части вариантов width
 * может отсутствовать (например, некоторые типы стикеров) — такие не должны тихо проигрывать
 * сравнение всем подряд и обнулять уже найденный лучший вариант, поэтому отсутствующая ширина
 * считается за 0, а не отбрасывает элемент.
 */
function biggestUrl(sizes: unknown): string | null {
  if (!Array.isArray(sizes) || sizes.length === 0) {
    return null;
  }

  const best = (sizes as Array<{ width?: number; url?: string }>).reduce((best, size) =>
    (size.width ?? 0) > (best.width ?? 0) ? size : best,
  );

  return best.url ?? null;
}

/** Ссылка на одно вложение — то немногое, что можно сохранить в текстовой колонке. */
function attachmentLink(attachment: VkAttachmentLike): string | null {
  const { type } = attachment;
  const item = attachment[type] as Record<string, unknown> | undefined;

  switch (type) {
    case 'photo':
      return biggestUrl(item?.sizes);
    case 'doc':
      return (item?.url as string | undefined) ?? null;
    case 'audio_message':
      return (item?.link_mp3 as string | undefined) ?? null;
    case 'link':
      return (item?.url as string | undefined) ?? null;
    case 'sticker':
      return biggestUrl(item?.images);
    default: {
      // video, wall, market и всё остальное — каноническая ссылка вида vk.com/video123_456
      const ownerId = item?.owner_id;
      const id = item?.id;
      return ownerId != null && id != null ? `https://vk.com/${type}${ownerId}_${id}` : null;
    }
  }
}

/**
 * Текст одного уровня пересланных/цитируемых сообщений — только сам текст и вложения, без
 * рекурсии во вложенные fwd_messages (такое бывает в этих B2B-диалогах: "смотри, вот их прайс"
 * целиком пересланным сообщением — без этого текст был бы пустым и сообщение бы молча
 * терялось при заливке).
 */
function nestedText(nested: VkMessageLike): string {
  const lines: string[] = [];

  if (nested.text) {
    lines.push(nested.text);
  }

  for (const attachment of (nested.attachments ?? []) as VkAttachmentLike[]) {
    const link = attachmentLink(attachment);
    if (link) {
      lines.push(link);
    }
  }

  return lines.join('\n');
}

/**
 * Текст сообщения плюс по одной ссылке на строку на каждое вложение — так у сообщений-только-
 * с-картинкой в базе остаётся что показать, не заводя отдельную колонку/таблицу вложений.
 * Пересланные/цитируемые сообщения разворачиваются на один уровень с пометкой «[переслано]».
 */
export function buildMessageText(message: VkMessageLike): string {
  const lines: string[] = [];

  if (message.text) {
    lines.push(message.text);
  }

  for (const attachment of (message.attachments ?? []) as VkAttachmentLike[]) {
    const link = attachmentLink(attachment);
    if (link) {
      lines.push(link);
    }
  }

  if (message.reply_message) {
    const text = nestedText(message.reply_message);
    if (text) {
      lines.push(`[переслано] ${text}`);
    }
  }

  for (const forwarded of message.fwd_messages ?? []) {
    const text = nestedText(forwarded);
    if (text) {
      lines.push(`[переслано] ${text}`);
    }
  }

  return lines.join('\n');
}
