import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMessageToUploadRow } from '../src/vk/mapMessage.js';

test('mapMessageToUploadRow uses snake_case keys — the backend upload endpoint rejects camelCase', () => {
  const row = mapMessageToUploadRow({
    id: 42,
    conversation_message_id: 42,
    date: 1_700_000_000,
    out: 1,
    text: 'привет',
    attachments: [],
  });

  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), ['created_at', 'is_my_message', 'text', 'vk_message_id']);
  assert.equal(row.vk_message_id, 42);
  assert.equal(row.is_my_message, true);
  assert.equal(row.text, 'привет');
  assert.equal(row.created_at, new Date(1_700_000_000 * 1000).toISOString());
});

test('mapMessageToUploadRow: out=0 is is_my_message=false', () => {
  const row = mapMessageToUploadRow({ id: 1, date: 1, out: 0, text: 'hi', attachments: [] });

  assert.equal(row.is_my_message, false);
});

test('mapMessageToUploadRow drops service (action) messages', () => {
  const row = mapMessageToUploadRow({
    id: 1,
    date: 1,
    out: 0,
    text: '',
    action: { type: 'chat_invite_user' },
  });

  assert.equal(row, null);
});

test('mapMessageToUploadRow drops messages with no text and no attachments', () => {
  const row = mapMessageToUploadRow({ id: 1, date: 1, out: 0, text: '', attachments: [] });

  assert.equal(row, null);
});

test('mapMessageToUploadRow keeps a photo-only message via its attachment link', () => {
  const row = mapMessageToUploadRow({
    id: 1,
    date: 1,
    out: 0,
    text: '',
    attachments: [
      {
        type: 'photo',
        photo: { sizes: [{ type: 'm', width: 130, url: 'https://example.com/small.jpg' }, { type: 'x', width: 604, url: 'https://example.com/big.jpg' }] },
      },
    ],
  });

  assert.ok(row);
  assert.equal(row.text, 'https://example.com/big.jpg');
});

test('mapMessageToUploadRow keeps a photo whose sizes lack width instead of dropping the link', () => {
  const row = mapMessageToUploadRow({
    id: 1,
    date: 1,
    out: 0,
    text: '',
    attachments: [{ type: 'photo', photo: { sizes: [{ type: 's', url: 'https://example.com/only.jpg' }] } }],
  });

  assert.ok(row);
  assert.equal(row.text, 'https://example.com/only.jpg');
});

test('mapMessageToUploadRow expands a forwarded-only message instead of dropping it', () => {
  const row = mapMessageToUploadRow({
    id: 1,
    date: 1,
    out: 0,
    text: '',
    fwd_messages: [{ text: 'смотри, вот их прайс', attachments: [] }],
  });

  assert.ok(row);
  assert.match(row.text, /смотри, вот их прайс/);
});
