import { describe, expect, it } from 'vitest';
import { costAvoidance, formatMoney, rateFor, requestCost, savedHourValue, sumOutcomes } from './value';
import { ServiceRequest, User } from '../types';

const users = new Map<string, User>([
  ['senior', { id: 'senior', hourlyRate: 120 } as User],
  ['junior', { id: 'junior' } as User]
]);
const team = { hourlyRate: 80 };

const req = (overrides: Partial<ServiceRequest>) =>
  ({ assigneeId: 'senior', estimatedHours: 10, history: [], outcome: null, ...overrides }) as unknown as ServiceRequest;

describe('rates and costs', () => {
  it("uses the person's rate, then the team's, else none", () => {
    expect(rateFor('senior', users, team)).toBe(120);
    expect(rateFor('junior', users, team)).toBe(80);
    expect(rateFor('junior', users, {})).toBeNull();
  });

  it('prices the estimate at the owner rate and logged hours at whoever logged them', () => {
    const r = req({
      history: [
        { at: '', byId: 'senior', byName: '', action: 'Logged 4h', hours: 4 },
        { at: '', byId: 'junior', byName: '', action: 'Logged 10h', hours: 10 },
        { at: '', byId: 'junior', byName: '', action: 'Comment' }
      ]
    });
    expect(requestCost(r, users, team)).toEqual({ estimated: 1200, actual: 4 * 120 + 10 * 80, variance: 80 });
  });

  it('returns nulls when no rates are configured', () => {
    expect(requestCost(req({ assigneeId: 'junior' }), users, {})).toEqual({ estimated: null, actual: null, variance: null });
  });

  it('formats money in the team currency', () => {
    expect(formatMoney(12000, 'USD')).toMatch(/12,000/);
  });
});

describe('outcomes', () => {
  it('totals measured results of one type', () => {
    const outcome = (metrics: { type: string; value: number; unit: string }[]) => ({ types: [], summary: '', metrics }) as unknown as ServiceRequest['outcome'];
    const requests = [
      req({ outcome: outcome([{ type: 'cost-avoidance', value: 5000, unit: 'USD' }, { type: 'time-saved', value: 20, unit: 'hours' }]) }),
      req({ outcome: outcome([{ type: 'cost-avoidance', value: 7000, unit: 'USD' }]) }),
      req({ outcome: null })
    ];
    expect(sumOutcomes(requests, 'cost-avoidance')).toEqual({ total: 12000, unit: 'USD', count: 2 });
    expect(sumOutcomes(requests, 'time-saved')).toEqual({ total: 20, unit: 'hours', count: 1 });
  });
});

describe('cost avoidance', () => {
  const outcome = (hoursSavedPerMonth: number | undefined, metrics: unknown[] = []) => ({ types: ['time-saved'], metrics, summary: 's', hoursSavedPerMonth });

  it('values an hour saved at the team’s own figure, else its hourly rate', () => {
    expect(savedHourValue({ savedHourValue: 50, hourlyRate: 80 })).toBe(50);
    expect(savedHourValue({ savedHourValue: null, hourlyRate: 80 })).toBe(80);
    expect(savedHourValue({})).toBeNull();
  });

  it('turns hours saved a month into money a year, using confirmed hours over expected ones', () => {
    const done = [
      req({ outcome: outcome(10) as never, expectedBenefit: { hoursSavedPerMonth: 6, description: '' } }), // confirmed 10
      req({ expectedBenefit: { hoursSavedPerMonth: 4, description: '' } }), // no outcome yet: expected 4
      req({ outcome: outcome(0) as never, expectedBenefit: { hoursSavedPerMonth: 8, description: '' } }), // confirmed none
      req({ outcome: outcome(undefined, [{ type: 'cost-avoidance', value: 5000, unit: 'USD', description: '' }]) as never })
    ];
    const result = costAvoidance(done, () => ({ hourlyRate: 50 }));
    expect(result).toMatchObject({
      confirmedHoursPerMonth: 10,
      expectedHoursPerMonth: 4,
      confirmedPerYear: 10 * 12 * 50,
      expectedPerYear: 4 * 12 * 50,
      direct: 5000,
      confirmedCount: 1,
      expectedCount: 1
    });
    expect(costAvoidance(done, () => undefined).confirmedPerYear).toBeNull(); // no rate: hours only
  });
});
