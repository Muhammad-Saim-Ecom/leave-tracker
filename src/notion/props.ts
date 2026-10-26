// Small readers for Notion property values. Each returns a plain value, never throws.

type Props = Record<string, any>;

export function text(props: Props, name: string): string {
  const p = props[name];
  if (!p) return '';
  const parts = p.type === 'title' ? p.title : p.type === 'rich_text' ? p.rich_text : [];
  return (parts ?? []).map((x: any) => x.plain_text ?? '').join('').trim();
}

export function selectName(props: Props, name: string): string | null {
  const p = props[name];
  return p?.select?.name ?? p?.status?.name ?? null;
}

export interface NotionPerson {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
}

export function people(props: Props, name: string): NotionPerson[] {
  return (props[name]?.people ?? []).map((u: any) => ({
    id: String(u.id),
    name: String(u.name ?? '').trim(),
    email: typeof u.person?.email === 'string' ? u.person.email.toLowerCase() : null,
    avatar: typeof u.avatar_url === 'string' && u.avatar_url ? u.avatar_url : null,
  }));
}

/** "👩‍🍳Lead Developer" → "lead developer", so labels can be matched without emoji. */
export function normalizeLabel(label: string): string {
  return label.replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Start and end (date part only) of a date property, or nulls. */
export function dateRange(props: Props, name: string): { start: string | null; end: string | null } {
  const d = props[name]?.date;
  const day = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null);
  return { start: day(d?.start), end: day(d?.end) };
}

export function number(props: Props, name: string): number | null {
  const v = props[name]?.number;
  return typeof v === 'number' ? v : null;
}

export function formulaNumber(props: Props, name: string): number | null {
  const v = props[name]?.formula?.number;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
