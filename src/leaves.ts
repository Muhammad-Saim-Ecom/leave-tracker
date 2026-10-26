import { dateRange, formulaNumber, normalizeLabel, number, people, selectName, text } from './notion/props.js';

export type Approval = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type Finance = 'NEW' | 'PROCESSED' | null;

/** Coarse department groups. The Notion "Dept" select has duplicates (e.g. "QI" and "🕵️‍♀️Quality Inspection"). */
export const DEPT_GROUPS = ['Engineering', 'Quality Inspection', 'Account Managers', 'Design', 'Operations', 'Unassigned'] as const;
export type DeptGroup = (typeof DEPT_GROUPS)[number];

const DEPT_GROUP_BY_LABEL: Record<string, DeptGroup> = {
  // Same set as the Notion "Dev Dept View" / "dev dept table" filters
  development: 'Engineering',
  engineering: 'Engineering',
  'lead engineering': 'Engineering',
  'lead developer': 'Engineering',
  'after shift engineering': 'Engineering',
  architect: 'Engineering',
  data: 'Engineering',
  'workflow automation': 'Engineering',
  netsuite: 'Engineering',
  qi: 'Quality Inspection',
  'quality inspection': 'Quality Inspection',
  'account managers': 'Account Managers',
  'account manager': 'Account Managers',
  design: 'Design',
};

export function deptGroupOf(dept: string | null): DeptGroup {
  if (!dept) return 'Unassigned';
  return DEPT_GROUP_BY_LABEL[normalizeLabel(dept)] ?? 'Operations';
}

export interface Leave {
  id: string;
  url: string;
  /** Request title, e.g. "Mayur Godhani - Vacation Leave" */
  title: string;
  name: string;
  email: string | null;
  avatar: string | null;
  leads: string[];
  manager: string;
  managerEmail: string | null;
  /** Dept label without emoji, e.g. "Lead Developer" */
  dept: string;
  deptGroup: DeptGroup;
  type: string;
  approval: Approval;
  finance: Finance;
  /** YYYY-MM-DD, inclusive */
  start: string | null;
  end: string | null;
  /** Parsed "Number of Days" (a text field in Notion); null when blank or not a number */
  days: number | null;
  deducted: number | null;
  unpaid: number | null;
  /** Leave credit balances recorded on the request (a snapshot when it was filed) */
  balance: { vacation: number | null; sick: number | null; emergency: number | null };
  note: string;
  createdAt: string;
  editedAt: string;
  /** The person's Team Members record (live balance and employment status); null when not found there */
  employee?: {
    status: string | null;
    balance: { vacation: number | null; sick: number | null; emergency: number | null };
    balanceUpdated: string | null;
  } | null;
}

const APPROVALS = new Set<string>(['Approved', 'Rejected', 'Cancelled']);

function parseDays(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const cleanLabel = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();

export function toLeave(page: any): Leave {
  const p = page.properties ?? {};
  const who = people(p, 'Who?')[0];
  const title = text(p, 'Name');
  const emailText = text(p, 'Email').toLowerCase();
  const approval = selectName(p, 'Approval');
  const finance = selectName(p, 'For Finance Processing');
  const dept = selectName(p, 'Dept');

  const startProp = dateRange(p, 'Leave Start Date');
  const endProp = dateRange(p, 'Leave End Date');
  const span = dateRange(p, 'Leave Dates');
  const start = startProp.start ?? span.start;
  let end = endProp.start ?? span.end ?? startProp.end ?? start;
  if (start && end && end < start) end = start;

  return {
    id: String(page.id),
    url: String(page.url ?? ''),
    title,
    // Some older requests have no "Who?"; their title is "<Name> - <Type>" or just the name
    name: who?.name || title.split(/\s+-\s+/)[0]?.trim() || emailText || 'Unknown',
    email: who?.email ?? (emailText || null),
    avatar: who?.avatar ?? null,
    leads: people(p, 'Lead').map((u) => u.name).filter(Boolean),
    manager: text(p, 'Manager'),
    managerEmail: text(p, 'Manager Email').toLowerCase() || null,
    dept: dept ? cleanLabel(dept) : '',
    deptGroup: deptGroupOf(dept),
    type: selectName(p, 'Leave Type') ?? 'Unspecified',
    approval: approval && APPROVALS.has(approval) ? (approval as Approval) : 'Pending',
    finance: finance === 'NEW' || finance === 'PROCESSED' ? finance : null,
    start,
    end,
    days: parseDays(text(p, 'Number of Days')),
    deducted: number(p, 'Days Reduced From Credit'),
    unpaid: formulaNumber(p, 'Unpaid Leaves Count'),
    balance: {
      vacation: number(p, 'Vacation Leave balance'),
      sick: number(p, 'Sick Leave balance'),
      emergency: number(p, 'Emergency Leave balance'),
    },
    note: text(p, 'Note'),
    createdAt: String(page.created_time ?? ''),
    editedAt: String(page.last_edited_time ?? ''),
  };
}

/** Properties the app reads, with the Notion type it expects. Checked at boot. */
export const REQUIRED_PROPS: Record<string, string> = {
  Name: 'title',
  'Who?': 'people',
  Approval: 'select',
  'Leave Type': 'select',
  'Leave Start Date': 'date',
  'Leave End Date': 'date',
  'Number of Days': 'rich_text',
  'For Finance Processing': 'select',
  Dept: 'select',
};
