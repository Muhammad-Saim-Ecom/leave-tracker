import { loadConfig } from './config.js';
import { REQUIRED_PROPS } from './leaves.js';
import { createNotionClient, resolveDataSource } from './notion/client.js';
import { TEAM_REQUIRED_PROPS } from './notion/team.js';
import { createServer } from './server/http.js';
import { LeaveStore } from './store.js';

async function main() {
  const cfg = loadConfig();
  const notion = createNotionClient({ token: cfg.notion.token });

  console.log('[boot] checking the Notion Leave Tracker database…');
  const leaves = await resolveDataSource(notion, cfg.notion.leaveDbId, REQUIRED_PROPS);
  const team = await resolveDataSource(notion, cfg.notion.teamDbId, TEAM_REQUIRED_PROPS);
  const store = new LeaveStore(notion, { leaves, team }, cfg.notion);
  await store.sync(true);
  console.log(`[boot] loaded ${store.leaves.length} leave requests (${store.hiddenFormer} more from people who are no longer Active are hidden)`);
  store.start();

  const app = createServer(cfg, store);
  await app.listen({ port: cfg.port, host: '0.0.0.0' });
  console.log(`[boot] Leave Tracker running on http://localhost:${cfg.port} (syncing every ${cfg.notion.syncSec}s)`);

  const shutdown = async () => { store.stop(); await app.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
