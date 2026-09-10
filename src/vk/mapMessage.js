import { buildMessageText } from './messageText.js';

/**
 * VK-сообщение -> строка для POST /admin/sales/messages/upload, или null, если сообщению
 * нечего сохранять (служебное действие / нет текста и вложений).
 *
 * Ключи — snake_case: это ровно то, что читает бэкенд (SalesMessagesController::toUploadItem).
 * Вынесено в чистую функцию и отдельный модуль специально ради unit-теста на этот контракт —
 * расхождение в регистре имён полей однажды уже роняло каждую заливку с 400 незамеченным.
 */
export function mapMessageToUploadRow(message) {
  if (message.action) {
    return null;
  }

  const text = buildMessageText(message);
  if (!text) {
    return null;
  }

  return {
    vk_message_id: message.id,
    text,
    is_my_message: message.out === 1,
    created_at: new Date(message.date * 1000).toISOString(),
  };
}
