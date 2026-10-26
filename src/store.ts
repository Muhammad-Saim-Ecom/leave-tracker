import type { Config } from './config.js';
import type { NotionClient } from './notion/client.js';
import { attachEmployees, isFormerEmployee, type TeamMember, toTeamMember } from './notion/team.js';
import { type Leave, toLeave } from './leaves.js';

/**
 * Keeps every leave request in memory. A full read (~20 Notion calls for ~2k rows, plus
 * ~3 for Team Members) runs at boot and every `fullSyncSec`; in between only rows edited
 * since the last sync are fetched, so approvals made in Notion show up within `syncSec`.
 */
export class LeaveStore {
  private rows = new Map<string, Leave>();
  private team: TeamMember[] = [];
  private view: { version: number; leaves: Leave[]; hiddenFormer: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private lastFullAt = 0;
  private lastSyncStartedAt: string | null = null;

  fetchedAt: string | null = null;
  lastError: string | null = null;
  version = 0;

  constructor(
    private readonly notion: NotionClient,
    private readonly ds: { leaves: string; team: string },
    private readonly cfg: Config['notion'],
  ) {}

  /** Requests of current employees only: anyone Resigned or Fired in Team Members is left out. */
  get leaves(): Leave[] {
    return this.current().leaves;
  }

  /** How many requests were left out because the person is no longer Active. */
  get hiddenFormer(): number {
    return this.current().hiddenFormer;
  }

  private current() {
    if (this.view?.version !== this.version) {
      const all = attachEmployees([...this.rows.values()], this.team);
      const leaves = all.filter((l) => !isFormerEmployee(l));
      this.view = { version: this.version, leaves, hiddenFormer: all.length - leaves.length };
    }
    return this.view;
  }

  start() {
    const tick = () => {
      this.sync().catch(() => undefined).finally(() => {
        this.timer = setTimeout(tick, this.cfg.syncSec * 1000);
      });
    };
    this.timer = setTimeout(tick, this.cfg.syncSec * 1000);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Runs one sync (full when due or forced); concurrent callers share the same run. */
  sync(force = false): Promise<void> {
    this.running ??= this.runSync(force).finally(() => { this.running = null; });
    return this.running;
  }

  private async runSync(forceFull: boolean) {
    const full = forceFull || !this.lastSyncStartedAt || Date.now() - this.lastFullAt > this.cfg.fullSyncSec * 1000;
    const startedAt = new Date().toISOString();
    try {
      if (full) {
        const [pages, members] = [await this.notion.queryAll(this.ds.leaves), await this.notion.queryAll(this.ds.team)];
        this.rows = new Map(pages.filter((pg) => !pg.in_trash).map((pg) => [String(pg.id), toLeave(pg)]));
        this.team = members.filter((pg) => !pg.in_trash).map(toTeamMember);
        this.lastFullAt = Date.now();
        this.version++;
      } else {
        // Notion rounds last_edited_time to the minute, so look back a little further than the last run.
        const since = new Date(Date.parse(this.lastSyncStartedAt!) - 2 * 60_000).toISOString();
        const pages = await this.notion.queryAll(this.ds.leaves, {
          filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } },
        });
        let changed = false;
        for (const pg of pages) {
          const id = String(pg.id);
          if (pg.in_trash) { changed = this.rows.delete(id) || changed; continue; }
          const next = toLeave(pg);
          if (this.rows.get(id)?.editedAt !== next.editedAt) { this.rows.set(id, next); changed = true; }
        }
        if (changed) this.version++;
      }
      this.lastSyncStartedAt = startedAt;
      this.fetchedAt = new Date().toISOString();
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error(`[sync] ${full ? 'full' : 'incremental'} sync failed: ${this.lastError}`);
      throw err;
    }
  }
}
