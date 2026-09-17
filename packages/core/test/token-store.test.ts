import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTokenRefreshDue, TOKEN_REFRESH_AFTER_MS, type SavedToken } from '../src/vk/token-store.js';

function tokenSavedAgo(ms: number): SavedToken {
  return {
    browserId: 1,
    accessToken: 'token',
    savedAt: new Date(Date.now() - ms).toISOString(),
  };
}

test('isTokenRefreshDue is false just under the 23h59m59s boundary', () => {
  assert.equal(isTokenRefreshDue(tokenSavedAgo(TOKEN_REFRESH_AFTER_MS - 1_000)), false);
});

test('isTokenRefreshDue is true at/just past the boundary', () => {
  assert.equal(isTokenRefreshDue(tokenSavedAgo(TOKEN_REFRESH_AFTER_MS)), true);
  assert.equal(isTokenRefreshDue(tokenSavedAgo(TOKEN_REFRESH_AFTER_MS + 1_000)), true);
});
