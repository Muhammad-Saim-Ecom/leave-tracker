export interface UpstreamCall {
  at: string;
  source: string;
  ms: number;
  ok: boolean;
  httpStatus: number | null;
  error?: string;
}

const BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';

export class NotionError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'NotionError';
  }
}

export interface NotionClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  /** Notion allows ~3 requests/second. Calls are serialized with at least this gap. */
  minIntervalMs?: number;
  maxRetries?: number;
  onCall?: (call: UpstreamCall) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface NotionClient {
  request<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T>;
  /** Runs a data source query and follows `next_cursor` until done. */
  queryAll(dataSourceId: string, body?: Record<string, unknown>): Promise<any[]>;
  callCount(): number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createNotionClient(opts: NotionClientOptions): NotionClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const minIntervalMs = opts.minIntervalMs ?? 350;
  const maxRetries = opts.maxRetries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;
  let queue: Promise<unknown> = Promise.resolve();
  let lastCallAt = 0;
  let calls = 0;

  async function send(method: string, path: string, body: unknown): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const wait = lastCallAt + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      calls++;

      const started = Date.now();
      const record = (c: Omit<UpstreamCall, 'at' | 'source' | 'ms'>) =>
        opts.onCall?.({ at: new Date(started).toISOString(), source: `notion:${path.split('/')[1]}`, ms: Date.now() - started, ...c });

      let res: Response;
      try {
        res = await fetchImpl(BASE_URL + path, {
          method,
          headers: {
            Authorization: `Bearer ${opts.token}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        record({ ok: false, httpStatus: null, error: message });
        if (attempt < maxRetries) { await sleep(1000 * 2 ** attempt); continue; }
        throw new NotionError(null, null, `Notion request failed (${path}): ${message}`);
      }

      if (res.ok) { record({ ok: true, httpStatus: res.status }); return res.json(); }

      const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
      record({ ok: false, httpStatus: res.status, error: err.message });
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      throw new NotionError(res.status, err.code ?? null, `Notion ${method} ${path} → HTTP ${res.status}: ${err.message ?? 'unknown error'}`);
    }
  }

  const request: NotionClient['request'] = (method, path, body) => {
    const run = queue.then(() => send(method, path, body));
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    request,
    async queryAll(dataSourceId, body = {}) {
      const rows: any[] = [];
      let cursor: string | undefined;
      do {
        const page = await request<any>('POST', `/data_sources/${dataSourceId}/query`, {
          ...body,
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        rows.push(...page.results);
        cursor = page.has_more ? page.next_cursor : undefined;
      } while (cursor);
      return rows;
    },
    callCount: () => calls,
  };
}

/**
 * Resolves a database ID to its (single) data source and checks that the
 * properties the app depends on still exist with the expected types.
 */
export async function resolveDataSource(
  notion: NotionClient,
  databaseId: string,
  required: Record<string, string>,
): Promise<string> {
  const db = await notion.request<any>('GET', `/databases/${databaseId}`);
  const dsId: string | undefined = db.data_sources?.[0]?.id;
  if (!dsId) throw new NotionError(null, null, `Database ${databaseId} has no data source (is it shared with the integration?)`);
  const ds = await notion.request<any>('GET', `/data_sources/${dsId}`);
  const props: Record<string, { type: string }> = ds.properties ?? {};
  const problems = Object.entries(required)
    .filter(([name, type]) => props[name]?.type !== type)
    .map(([name, type]) => `"${name}" should be ${type}, found ${props[name]?.type ?? 'nothing'}`);
  if (problems.length) {
    const title = (db.title ?? []).map((t: any) => t.plain_text).join('');
    throw new NotionError(null, 'schema_changed', `Notion "${title}" schema changed: ${problems.join('; ')}`);
  }
  return dsId;
}
