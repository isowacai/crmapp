import { describe, expect, it } from 'vitest';
import { activeFilterCount, DEFAULT_FILTERS, filterDemand } from './demandFilters';
import { ServiceRequest } from '../types';

const at = (date: string) => ({ seconds: new Date(`${date}T12:00:00`).getTime() / 1000, nanoseconds: 0 });

const req = (id: string, overrides: Partial<ServiceRequest>): ServiceRequest =>
  ({
    id,
    requestNumber: id,
    teamId: 'ops',
    teamName: 'Ops',
    serviceId: 's1',
    serviceName: 'Report',
    title: `Request ${id}`,
    requesterId: 'rae',
    requesterName: 'Rae',
    assigneeId: '',
    assigneeName: '',
    status: 'new',
    priority: '',
    dueDate: '',
    createdAt: at('2026-09-10'),
    ...overrides
  }) as ServiceRequest;

const requests = [
  req('a', { status: 'new' }),
  req('b', { status: 'committed', priority: 'high', assigneeId: 'jo', assigneeName: 'Jo', serviceId: 's2', createdAt: at('2026-09-20') }),
  req('c', { status: 'completed', priority: 'critical', assigneeId: 'jo', requesterId: 'me' }),
  req('d', { status: 'declined', teamId: 'data', teamName: 'Data' })
];

const ids = (rs: ServiceRequest[]) => rs.map(r => r.id);

describe('filterDemand', () => {
  it('shows open demand by default, most urgent first', () => {
    expect(ids(filterDemand(requests, DEFAULT_FILTERS, 'me'))).toEqual(['a', 'b']);
  });

  it('can include every status, or ignore status for the board', () => {
    expect(ids(filterDemand(requests, { ...DEFAULT_FILTERS, status: 'all' }, 'me'))).toHaveLength(4);
    expect(ids(filterDemand(requests, DEFAULT_FILTERS, 'me', { ignoreStatus: true }))).toHaveLength(4);
  });

  it('scopes to my requests or my assignments', () => {
    expect(ids(filterDemand(requests, { ...DEFAULT_FILTERS, scope: 'mine', status: 'all' }, 'me'))).toEqual(['c']);
    expect(ids(filterDemand(requests, { ...DEFAULT_FILTERS, scope: 'assigned', status: 'all' }, 'jo'))).toEqual(['b', 'c']);
  });

  it('filters by service, team, owner, priority, and dates', () => {
    const all = { ...DEFAULT_FILTERS, status: 'all' as const };
    expect(ids(filterDemand(requests, { ...all, serviceId: 's2' }, 'me'))).toEqual(['b']);
    expect(ids(filterDemand(requests, { ...all, teamId: 'data' }, 'me'))).toEqual(['d']);
    expect(ids(filterDemand(requests, { ...all, ownerId: '-' }, 'me')).sort()).toEqual(['a', 'd']);
    expect(ids(filterDemand(requests, { ...all, priority: 'none' }, 'me')).sort()).toEqual(['a', 'd']);
    expect(ids(filterDemand(requests, { ...all, priority: 'critical' }, 'me'))).toEqual(['c']);
    expect(ids(filterDemand(requests, { ...all, createdFrom: '2026-09-15' }, 'me'))).toEqual(['b']);
    expect(ids(filterDemand(requests, { ...all, createdTo: '2026-09-15' }, 'me'))).toHaveLength(3);
  });

  it('searches number, title, service, and people', () => {
    expect(ids(filterDemand(requests, { ...DEFAULT_FILTERS, search: 'jo' }, 'me'))).toEqual(['b']);
  });

  it('counts active filters', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, search: 'x', priority: 'high', status: 'all' })).toBe(3);
  });
});
