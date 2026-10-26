// One read-only pass over the Leave Tracker, printed in the terminal.
import { loadConfig } from '../config.js';
import { REQUIRED_PROPS, toLeave } from '../leaves.js';
import { createNotionClient, resolveDataSource } from '../notion/client.js';
import { attachEmployees, isFormerEmployee, TEAM_REQUIRED_PROPS, toTeamMember } from '../notion/team.js';

const cfg = loadConfig();
const notion = createNotionClient({ token: cfg.notion.token });
const ds = await resolveDataSource(notion, cfg.notion.leaveDbId, REQUIRED_PROPS);
const teamDs = await resolveDataSource(notion, cfg.notion.teamDbId, TEAM_REQUIRED_PROPS);
const team = (await notion.queryAll(teamDs)).map(toTeamMember);
const all = attachEmployees((await notion.queryAll(ds)).map(toLeave), team);
const leaves = all.filter((l) => !isFormerEmployee(l));
const today = new Date().toLocaleDateString('en-CA');

const count = (key: (l: (typeof leaves)[number]) => string) =>
  Object.entries(leaves.reduce<Record<string, number>>((acc, l) => ({ ...acc, [key(l)]: (acc[key(l)] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ');

console.log(`\n${leaves.length} requests from current employees, ${all.length - leaves.length} more from people no longer Active (${notion.callCount()} Notion calls)`);
console.log(`Not found in Team Members (still shown): ${[...new Set(leaves.filter((l) => !l.employee).map((l) => l.name))].join(', ') || 'none'}`);
console.log(`Approval:   ${count((l) => l.approval)}`);
console.log(`Type:       ${count((l) => l.type)}`);
console.log(`Department: ${count((l) => l.deptGroup)}`);

const out = leaves.filter((l) => l.approval === 'Approved' && l.start && l.start <= today && (l.end ?? l.start) >= today);
console.log(`\nOut today (${today}): ${out.length}`);
for (const l of out) console.log(`  ${l.name.padEnd(28)} ${l.type.padEnd(16)} until ${l.end}`);

const pending = leaves.filter((l) => l.approval === 'Pending').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
console.log(`\nAwaiting approval: ${pending.length}`);
for (const l of pending.slice(0, 15)) console.log(`  ${(l.start ?? '?').padEnd(11)} ${l.name.padEnd(28)} ${l.type.padEnd(16)} ${l.days ?? '?'}d  → ${l.manager || '—'}`);
