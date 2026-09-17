import { createServer } from 'node:http';
import { getEnvConfig } from '@vk-sales-bot/core';
import { accountRoutes } from './handlers/accounts.js';
import { chatMessageRoutes } from './handlers/chats.js';
import { chatStatusRoutes } from './handlers/chat-status.js';
import { conversationRoutes } from './handlers/conversations.js';
import { eventRoutes } from './handlers/events.js';
import { pinRoutes } from './handlers/pins.js';
import { startLongPollManager } from './long-poll-manager.js';
import { createRouter } from './router.js';

const env = getEnvConfig();

const handleRequest = createRouter(
  [
    ...eventRoutes(env),
    ...accountRoutes(env),
    ...conversationRoutes(env),
    ...pinRoutes(env),
    ...chatStatusRoutes(env),
    ...chatMessageRoutes(env),
  ],
  { corsOrigin: env.server.corsOrigin },
);

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(env.server.port, () => {
  console.log(`API server running at http://localhost:${env.server.port}`);
  startLongPollManager(env);
});
