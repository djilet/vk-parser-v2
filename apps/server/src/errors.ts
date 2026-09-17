import { AUTH_FAILED_CODE, VkApiError } from '@vk-sales-bot/core';

/**
 * A typed HTTP error, so a route handler can `throw badRequest('...')` and the router maps it
 * to a real status code instead of the old catch-all that turned every error into 400 —
 * an expired VK token, a bad peerId, and a genuine VK outage all looked identical to the UI.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, code = 'bad_request'): HttpError => new HttpError(400, message, code);
export const unauthorized = (message: string, code = 'unauthorized'): HttpError => new HttpError(401, message, code);
export const notFound = (message: string, code = 'not_found'): HttpError => new HttpError(404, message, code);
export const conflict = (message: string, code = 'conflict'): HttpError => new HttpError(409, message, code);

/** Central place errors from every layer (VK API, sales API, Node itself) get mapped to a status. */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof VkApiError) {
    if (error.code === AUTH_FAILED_CODE) {
      return unauthorized(error.message, 'vk_token_invalid');
    }
    return new HttpError(502, error.message, 'vk_upstream');
  }

  const message = error instanceof Error ? error.message : String(error);

  // A handful of existing library errors are thrown as plain Error with a validation-shaped
  // message (e.g. "accountId must be a positive integer", "Токен ... не найден") — treat those
  // as 400/404-ish client errors rather than 500s, matching the previous (accidental) behaviour
  // for the common cases, while unknown failures still surface as a real 500.
  if (/должен быть|must be|не найден|not found|cannot be empty|Invalid/i.test(message)) {
    return badRequest(message);
  }

  console.error('Unhandled server error:', error);
  return new HttpError(500, 'Internal server error', 'internal_error');
}
