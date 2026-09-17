import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEnvConfig } from '../src/env.js';

test('loadEnvConfig reads from the given env bag, not process.env — proves no argv/global coupling', () => {
  const config = loadEnvConfig({
    API_BASE_URL: 'https://example.test/api',
    API_PHONE: '+79990000000',
    API_CODE: '1234',
    VK_REQUEST_DELAY_MS: '500',
    PORT: '4000',
  } as NodeJS.ProcessEnv);

  assert.equal(config.api.baseUrl, 'https://example.test/api');
  assert.equal(config.api.phone, '+79990000000');
  assert.equal(config.vk.requestDelayMs, 500);
  assert.equal(config.server.port, 4000);
});

test('loadEnvConfig falls back to defaults for an empty env bag', () => {
  const config = loadEnvConfig({} as NodeJS.ProcessEnv);

  assert.equal(config.api.baseUrl, null);
  assert.equal(config.vk.requestDelayMs, 350);
  assert.equal(config.stats.timezone, 'Europe/Moscow');
  assert.equal(config.server.port, 3001);
});
