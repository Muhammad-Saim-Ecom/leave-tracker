import { describe, expect, it } from 'vitest';
import { deptGroupOf, toLeave } from '../src/leaves.js';

const rt = (s: string) => ({ type: 'rich_text', rich_text: [{ plain_text: s }] });
const sel = (name: string | null) => ({ type: 'select', select: name ? { name } : null });
const date = (start: string | null, end: string | null = null) => ({ type: 'date', date: start ? { start, end } : null });

function page(props: Record<string, unknown>) {
  return {
    id: 'p1',
    url: 'https://www.notion.so/p1',
    created_time: '2026-10-01T10:00:00.000Z',
    last_edited_time: '2026-10-02T10:00:00.000Z',
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'Jane Doe - Sick Leave' }] },
      'Who?': { type: 'people', people: [] },
      Lead: { type: 'people', people: [] },
      Approval: sel(null),
      'Leave Type': sel('Sick Leave'),
      'For Finance Processing': sel('NEW'),
      Dept: sel('👷Development'),
      'Leave Start Date': date('2026-11-09'),
      'Leave End Date': date('2026-11-10'),
      'Leave Dates': date(null),
      'Number of Days': rt('2'),
      Email: rt('Jane.Doe@ecomexperts.io'),
      Manager: rt('Boss'),
      'Manager Email': rt(''),
      Note: rt(''),
      'Days Reduced From Credit': { type: 'number', number: 2 },
      'Unpaid Leaves Count': { type: 'formula', formula: { type: 'number', number: 0 } },
      'Vacation Leave balance': { type: 'number', number: 6 },
      'Sick Leave balance': { type: 'number', number: null },
      'Emergency Leave balance': { type: 'number', number: 0 },
      ...props,
    },
  };
}

describe('toLeave', () => {
  it('treats a blank Approval as pending and falls back to the title and Email when "Who?" is empty', () => {
    const l = toLeave(page({}));
    expect(l.approval).toBe('Pending');
    expect(l.name).toBe('Jane Doe');
    expect(l.email).toBe('jane.doe@ecomexperts.io');
    expect(l).toMatchObject({ start: '2026-11-09', end: '2026-11-10', days: 2, finance: 'NEW', dept: 'Development', deptGroup: 'Engineering' });
    expect(l.balance).toEqual({ vacation: 6, sick: null, emergency: 0 });
  });

  it('prefers the "Who?" person', () => {
    const l = toLeave(page({ 'Who?': { type: 'people', people: [{ id: 'u1', name: 'Jane Q. Doe', avatar_url: 'https://x/a.png', person: { email: 'JQ@ecomexperts.io' } }] } }));
    expect(l).toMatchObject({ name: 'Jane Q. Doe', email: 'jq@ecomexperts.io', avatar: 'https://x/a.png' });
  });

  it('parses fractional and odd day counts', () => {
    expect(toLeave(page({ 'Number of Days': rt('.5') })).days).toBe(0.5);
    expect(toLeave(page({ 'Number of Days': rt('NaN') })).days).toBeNull();
    expect(toLeave(page({ 'Number of Days': rt('') })).days).toBeNull();
  });

  it('uses "Leave Dates" when the start/end properties are missing, and never ends before it starts', () => {
    const fromSpan = toLeave(page({ 'Leave Start Date': date(null), 'Leave End Date': date(null), 'Leave Dates': date('2026-01-05', '2026-01-07') }));
    expect(fromSpan).toMatchObject({ start: '2026-01-05', end: '2026-01-07' });
    const backwards = toLeave(page({ 'Leave End Date': date('2026-11-01') }));
    expect(backwards.end).toBe('2026-11-09');
  });

  it('keeps known approvals', () => {
    expect(toLeave(page({ Approval: sel('Cancelled') })).approval).toBe('Cancelled');
  });
});

describe('deptGroupOf', () => {
  it('merges the duplicate Notion departments', () => {
    expect(deptGroupOf('QI')).toBe('Quality Inspection');
    expect(deptGroupOf('🕵️‍♀️Quality Inspection')).toBe('Quality Inspection');
    expect(deptGroupOf('Account Managers')).toBe('Account Managers');
    expect(deptGroupOf('👩‍✈️Account Manager')).toBe('Account Managers');
    expect(deptGroupOf('👨‍🎤Design')).toBe('Design');
    expect(deptGroupOf('👩‍🍳Lead Developer')).toBe('Engineering');
    expect(deptGroupOf('🧑‍⚕️HR')).toBe('Operations');
    expect(deptGroupOf(null)).toBe('Unassigned');
  });
});
