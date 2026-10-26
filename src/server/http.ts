import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import Fastify from 'fastify';
import type { Config } from '../config.js';
import type { LeaveStore } from '../store.js';

const INDEX_HTML = new URL('./public/index.html', import.meta.url);
const REFRESH_MIN_GAP_MS = 20_000;

export function createServer(cfg: Config, store: LeaveStore) {
  const app = Fastify({ logger: false });
  let lastRefresh = 0;
  // The full payload is ~1 MB, so it is serialized and gzipped once per data change.
  let cache: { version: number; json: string; gz: Buffer } | null = null;

  // Basic auth on everything except /healthz (skipped when no credentials are configured, e.g. locally).
  if (cfg.basicAuth.user && cfg.basicAuth.pass) {
    const expected = 'Basic ' + Buffer.from(`${cfg.basicAuth.user}:${cfg.basicAuth.pass}`).toString('base64');
    app.addHook('onRequest', async (req, reply) => {
      if (req.url === '/healthz') return;
      if (req.headers.authorization !== expected) {
        reply.header('WWW-Authenticate', 'Basic realm="Leave Tracker"').code(401).send('Authentication required');
      }
    });
  }

  app.get('/', async (_req, reply) => {
    // Read per request so UI edits show up on reload during development.
    reply.type('text/html; charset=utf-8').send(readFileSync(INDEX_HTML, 'utf8'));
  });

  const icon = (file: string) => async (_req: unknown, reply: any) =>
    reply.type('image/png').header('Cache-Control', 'public, max-age=86400').send(readFileSync(new URL(`./public/${file}`, import.meta.url)));
  app.get('/favicon-32.png', icon('favicon-32.png'));
  app.get('/favicon.ico', icon('favicon-32.png'));
  app.get('/apple-touch-icon.png', icon('apple-touch-icon.png'));

  app.get('/api/leaves', async (req, reply) => {
    if (!store.fetchedAt) return reply.code(503).send({ error: 'warming up' });
    if (cache?.version !== store.version) {
      const json = JSON.stringify({ version: store.version, leaves: store.leaves, hiddenFormer: store.hiddenFormer });
      cache = { version: store.version, json, gz: gzipSync(json) };
    }
    reply.header('Cache-Control', 'no-store').header('X-Fetched-At', store.fetchedAt).type('application/json');
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) return reply.header('Content-Encoding', 'gzip').send(cache.gz);
    return reply.send(cache.json);
  });

  // Cheap poll for the page: has anything changed since the version it holds?
  app.get('/api/status', async () => ({ version: store.version, fetchedAt: store.fetchedAt, lastError: store.lastError }));

  app.post('/api/refresh', async (_req, reply) => {
    const wait = lastRefresh + REFRESH_MIN_GAP_MS - Date.now();
    if (wait > 0) return reply.code(429).send({ error: `try again in ${Math.ceil(wait / 1000)}s` });
    lastRefresh = Date.now();
    try {
      await store.sync();
    } catch (err) {
      return reply.code(502).send({ error: `Notion: ${err instanceof Error ? err.message : err}` });
    }
    return { version: store.version, fetchedAt: store.fetchedAt };
  });

  app.get('/healthz', async (_req, reply) => {
    const age = store.fetchedAt ? Date.now() - Date.parse(store.fetchedAt) : Infinity;
    const ok = age < 10 * 60_000;
    return reply.code(ok ? 200 : 503).send({ ok, fetchedAt: store.fetchedAt, rows: store.leaves.length, hiddenFormer: store.hiddenFormer, lastError: store.lastError });
  });

  return app;
}
