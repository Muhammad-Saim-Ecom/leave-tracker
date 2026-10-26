import type { Leave } from '../leaves.js';
import { dateRange, number, selectName, text } from './props.js';

/** The few Team Members fields this app reads. Salary and other private fields are never read. */
export interface TeamMember {
  name: string;
  emails: string[];
  /** "Active", "Resigned", "Fired", or null when not filled in */
  status: string | null;
  balance: { vacation: number | null; sick: number | null; emergency: number | null };
  balanceUpdated: string | null;
}

export const TEAM_REQUIRED_PROPS: Record<string, string> = {
  Name: 'title',
  'Employment Status': 'select',
};

const email = (props: Record<string, any>, name: string) => {
  const v = props[name]?.email;
  return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null;
};

export function toTeamMember(page: any): TeamMember {
  const p = page.properties ?? {};
  return {
    name: text(p, 'Name'),
    emails: [email(p, 'Email'), email(p, 'Company Email')].filter((e): e is string => !!e),
    status: selectName(p, 'Employment Status'),
    balance: {
      vacation: number(p, 'Vacation Leave Balance'),
      sick: number(p, 'Sick Leave Balance'),
      emergency: number(p, 'Emergency Leave Balance'),
    },
    balanceUpdated: dateRange(p, 'Last Balance Update').start,
  };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Finds each request's person in Team Members: by email first, then by exact name.
 * Requests with no match get `employee: null` (shown, since we can't tell they left).
 */
export function attachEmployees(leaves: Leave[], team: TeamMember[]): Leave[] {
  const byEmail = new Map<string, TeamMember>();
  const byName = new Map<string, TeamMember>();
  for (const m of team) {
    for (const e of m.emails) if (!byEmail.has(e)) byEmail.set(e, m);
    if (m.name && !byName.has(norm(m.name))) byName.set(norm(m.name), m);
  }
  return leaves.map((l) => {
    const m = (l.email && byEmail.get(l.email)) || byName.get(norm(l.name)) || null;
    return { ...l, employee: m ? { status: m.status, balance: m.balance, balanceUpdated: m.balanceUpdated } : null };
  });
}

/** Leaves whose person is in Team Members with a status other than Active (Resigned, Fired). */
export const isFormerEmployee = (l: Leave) => !!l.employee?.status && l.employee.status !== 'Active';
