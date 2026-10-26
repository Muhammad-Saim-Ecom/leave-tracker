import { existsSync } from 'node:fs';
import { z } from 'zod';

const int = (fallback: number) => z.coerce.number().int().default(fallback);

const EnvSchema = z.object({
  NOTION_TOKEN: z.string().min(1, 'missing. Use a Notion internal integration connected to the Leave Tracker page, see README.md'),
  NOTION_LEAVE_DB_ID: z.string().min(1).default('1519ca8db0d780318790d7765732736f'),
  // Team Members: Employment Status (only Active people are shown) and live leave balances
  NOTION_TEAM_DB_ID: z.string().min(1).default('d1b0d315d37e4a91a28dea8b30e96cbd'),
  NOTION_SYNC_SEC: int(60).pipe(z.number().min(15)),
  NOTION_FULL_SYNC_SEC: int(1800).pipe(z.number().min(300)),

  PORT: int(8090),
  BASIC_AUTH_USER: z.string().default(''),
  BASIC_AUTH_PASS: z.string().default(''),
});

export type Config = ReturnType<typeof toConfig>;

function toConfig(env: z.infer<typeof EnvSchema>) {
  return {
    notion: {
      token: env.NOTION_TOKEN,
      leaveDbId: env.NOTION_LEAVE_DB_ID,
      teamDbId: env.NOTION_TEAM_DB_ID,
      syncSec: env.NOTION_SYNC_SEC,
      fullSyncSec: env.NOTION_FULL_SYNC_SEC,
    },
    port: env.PORT,
    basicAuth: { user: env.BASIC_AUTH_USER, pass: env.BASIC_AUTH_PASS },
  };
}

/** Reads `.env` (if present) into process.env, validates, and fails fast with a readable message. */
export function loadConfig(envPath = '.env'): Config {
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration in ${envPath}:\n${lines.join('\n')}`);
  }
  return toConfig(parsed.data);
}
