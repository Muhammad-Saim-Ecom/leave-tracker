import { describe, expect, it } from 'vitest';
import type { Leave } from '../src/leaves.js';
import { attachEmployees, isFormerEmployee, type TeamMember } from '../src/notion/team.js';

const member = (name: string, emails: string[], status: string | null): TeamMember => ({
  name, emails, status, balance: { vacation: 5, sick: 2, emergency: 1 }, balanceUpdated: '2026-10-01',
});
const leave = (name: string, email: string | null) => ({ id: name, name, email }) as Leave;

describe('attachEmployees', () => {
  const team = [
    member('Ada Active', ['ada@ecomexperts.io'], 'Active'),
    member('Rex Resigned', ['rex@gmail.com', 'rex@ecomexperts.io'], 'Resigned'),
    member('Fay Fired', [], 'Fired'),
    member('Nina Nostatus', ['nina@ecomexperts.io'], null),
  ];
  const out = attachEmployees([
    leave('Ada Active', 'ada@ecomexperts.io'),
    leave('Rex R', 'rex@ecomexperts.io'),
    leave('fay  fired', null),
    leave('Nina Nostatus', 'nina@ecomexperts.io'),
    leave('Stranger', 'who@ecomexperts.io'),
  ], team);
  const byId = Object.fromEntries(out.map((l) => [l.id, l]));

  it('matches by any of the member emails, then by name', () => {
    expect(byId['Rex R']!.employee?.status).toBe('Resigned');
    expect(byId['fay  fired']!.employee?.status).toBe('Fired');
    expect(byId['Ada Active']!.employee?.balance.vacation).toBe(5);
  });

  it('hides only people marked as no longer Active', () => {
    expect(out.filter(isFormerEmployee).map((l) => l.id)).toEqual(['Rex R', 'fay  fired']);
    // No status, or not in Team Members at all: can't tell they left, so they stay visible
    expect(isFormerEmployee(byId['Nina Nostatus']!)).toBe(false);
    expect(byId.Stranger!.employee).toBeNull();
    expect(isFormerEmployee(byId.Stranger!)).toBe(false);
  });
});
