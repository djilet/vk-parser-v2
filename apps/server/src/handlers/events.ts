import type { EnvConfig } from '@vk-sales-bot/core';
import { eventBus } from '../event-bus.js';
import type { Route } from '../router.js';

export function eventRoutes(env: Pick<EnvConfig, 'server'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/events',
      handler: async (ctx) => {
        ctx.res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': env.server.corsOrigin,
        });
        ctx.res.write('\n');

        const unsubscribe = eventBus.subscribe((event) => {
          ctx.res.write(`data: ${JSON.stringify(event)}\n\n`);
        });

        const heartbeat = setInterval(() => {
          ctx.res.write(': heartbeat\n\n');
        }, 30_000);

        await new Promise<void>((resolve) => {
          ctx.res.on('close', () => {
            clearInterval(heartbeat);
            unsubscribe();
            resolve();
          });
        });
      },
    },
  ];
}
