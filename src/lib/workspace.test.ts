import { describe, expect, it } from 'vitest';
import { buildAnswers, canRequest, kpisOf, newField, validateRequestFields, workflowOf } from './workspace';
import { RequestField } from '../types';

const field = (overrides: Partial<RequestField>): RequestField => ({ id: 'q1', label: 'System', type: 'text', required: false, options: [], help: '', ...overrides });

describe('request access', () => {
  it('lets everyone request by default', () => {
    expect(canRequest({ id: 'ops' }, undefined)).toBe(true);
  });
  it('limits to selected teams, always allowing the delivering team', () => {
    const team = { id: 'ops', requestAccess: { mode: 'teams' as const, teamIds: ['sales'] } };
    expect(canRequest(team, 'sales')).toBe(true);
    expect(canRequest(team, 'ops')).toBe(true);
    expect(canRequest(team, 'hr')).toBe(false);
    expect(canRequest(team, undefined)).toBe(false);
  });
});

describe('request questions', () => {
  it('validates question definitions', () => {
    expect(validateRequestFields([field({})])).toEqual([]);
    expect(validateRequestFields([field({ label: ' ' })])[0]).toMatch(/needs some text/);
    expect(validateRequestFields([field({ type: 'select', options: ['Only one'] })])[0]).toMatch(/two options/);
  });

  it('makes unique IDs for new questions', () => {
    expect(newField([field({ id: 'q1' }), field({ id: 'q2' })]).id).toBe('q3');
  });

  it('builds answers, enforcing required questions, numbers, and choices', () => {
    const fields = [
      field({ id: 'sys', label: 'System', required: true }),
      field({ id: 'users', label: 'Users affected', type: 'number' }),
      field({ id: 'env', label: 'Environment', type: 'select', options: ['Prod', 'Test'] }),
      field({ id: 'note', label: 'Anything else' })
    ];
    expect(buildAnswers(fields, { sys: ' CRM ', users: '40', env: 'Prod' })).toEqual({
      answers: [
        { fieldId: 'sys', label: 'System', value: 'CRM' },
        { fieldId: 'users', label: 'Users affected', value: '40' },
        { fieldId: 'env', label: 'Environment', value: 'Prod' }
      ],
      problems: []
    });
    expect(buildAnswers(fields, { users: 'lots', env: 'Staging' }).problems).toEqual([
      'Please answer "System".',
      '"Users affected" must be a number.',
      'Choose one of the options for "Environment".'
    ]);
  });
});

describe('workflow and KPIs', () => {
  it('defaults every optional stage on', () => {
    expect(workflowOf(undefined)).toEqual({ useAssessing: true, usePlanned: true });
    expect(workflowOf({ workflow: { useAssessing: false, usePlanned: true } }).useAssessing).toBe(false);
  });

  it('uses the default KPIs unless the team chose valid ones', () => {
    expect(kpisOf(undefined)).toHaveLength(6);
    expect(kpisOf({ dashboardKpis: ['overdue', 'bogus', 'leadTime'] })).toEqual(['overdue', 'leadTime']);
  });
});
