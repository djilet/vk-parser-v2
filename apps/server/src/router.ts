import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { HttpError, toHttpError } from './errors.js';

export type RequestContext = {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  readBody: () => Promise<Record<string, unknown>>;
  send: (status: number, data: unknown) => void;
};

export type Handler = (ctx: RequestContext) => Promise<void>;

export type Route = {
  method: string;
  path: string;
  handler: Handler;
};

type CompiledRoute = Route & { pattern: RegExp; paramNames: string[] };

function compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];

  const source = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        // peerId can be negative (community peers) — allow a leading '-'.
        return '(-?[^/]+)';
      }
      return segment;
    })
    .join('/');

  return { pattern: new RegExp(`^${source}$`), paramNames };
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function createRouter(routes: Route[], options: { corsOrigin: string }) {
  const compiled: CompiledRoute[] = routes.map((route) => ({ ...route, ...compilePath(route.path) }));

  function send(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(options.corsOrigin) });
    res.end(JSON.stringify(data));
  }

  return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(options.corsOrigin));
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const method = req.method ?? 'GET';

    for (const route of compiled) {
      if (route.method !== method) continue;

      const match = route.pattern.exec(url.pathname);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1] ?? '');
      });

      try {
        await route.handler({
          req,
          res,
          params,
          query: url.searchParams,
          readBody: () => readBody(req),
          send: (status, data) => send(res, status, data),
        });
      } catch (error) {
        const httpError = toHttpError(error);
        send(res, httpError.status, { error: httpError.message, code: httpError.code });
      }

      return;
    }

    send(res, 404, { error: 'Not found', code: 'not_found' });
  };
}

export { corsHeaders };
