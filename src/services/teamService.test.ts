import { describe, expect, it, vi } from 'vitest';
import { applyTeamLinks, planTeamLinks } from './teamService';
import { Service, ServiceRequest, Team, User } from '../types';

const service = (id: string, ownerTeam: string, teamId = ''): Service =>
  ({ id, name: id, category: 'c', description: '', ownerTeam, teamId, active: true }) as Service;
const user = (id: string, team: string, teamId = ''): User => ({ id, displayName: id, team, teamId, role: 'staff' }) as User;
const team = (id: string, name: string): Team => ({ id, name }) as Team;

describe('planTeamLinks', () => {
  it('creates each missing team once and links services and people by name, ignoring case', () => {
    const plan = planTeamLinks(
      [service('s1', 'IT Operations'), service('s2', 'it operations'), service('s3', 'Data'), service('s4', 'Linked', 't9')],
      [user('u1', 'IT Operations'), user('u2', ''), user('u3', 'Data', 'data')],
      [team('data', 'Data')]
    );
    expect(plan.teamsToCreate).toEqual(['IT Operations']);
    expect(plan.serviceLinks).toEqual([
      { serviceId: 's1', teamName: 'IT Operations' },
      { serviceId: 's2', teamName: 'IT Operations' },
      { serviceId: 's3', teamName: 'Data' }
    ]);
    expect(plan.userLinks).toEqual([{ userId: 'u1', teamName: 'IT Operations' }]);
    expect(plan.unlinkable).toEqual([]);
  });

  it("links existing requests to their service's team", () => {
    const r = (id: string, serviceId: string, teamId = '') => ({ id, serviceId, teamId, history: [] }) as unknown as ServiceRequest;
    const plan = planTeamLinks([service('s1', 'IT Operations'), service('s2', 'Data', 'data')], [], [team('data', 'Data')], [
      r('R1', 's1'), r('R2', 's2'), r('R3', 's2', 'data'), r('R4', 'gone')
    ]);
    expect(plan.requestLinks.map(l => [l.request.id, l.teamName])).toEqual([['R1', 'IT Operations'], ['R2', 'Data']]);
  });

  it("reports services with no team name, and doesn't treat \"Unassigned\" as a team", () => {
    const plan = planTeamLinks([service('s1', ''), service('s2', 'Unassigned')], [user('u1', 'Unassigned')], []);
    expect(plan.teamsToCreate).toEqual([]);
    expect(plan.unlinkable.map(s => s.id)).toEqual(['s1', 's2']);
    expect(plan.userLinks).toEqual([]);
  });
});

describe('applyTeamLinks', () => {
  it('creates teams first, then links using their new IDs', async () => {
    const writes = {
      addTeam: vi.fn(async () => ({ id: 'new-id' })),
      updateTeam: vi.fn(),
      updateService: vi.fn(async () => undefined),
      updateUser: vi.fn(async () => undefined)
    };
    const teams = [team('data', 'Data')];
    const updateRequest = vi.fn(async () => undefined);
    await applyTeamLinks(
      {
        teamsToCreate: ['IT Operations'],
        serviceLinks: [{ serviceId: 's1', teamName: 'IT Operations' }, { serviceId: 's3', teamName: 'Data' }],
        userLinks: [{ userId: 'u1', teamName: 'IT Operations' }],
        requestLinks: [{ request: { id: 'R1', history: [{ action: 'Submitted' }] } as unknown as ServiceRequest, teamName: 'IT Operations' }],
        unlinkable: []
      },
      teams,
      { ...writes, updateRequest },
      { id: 'a1', name: 'Admin' },
      new Date('2026-10-01T10:00:00Z')
    );
    expect(updateRequest).toHaveBeenCalledWith('R1', {
      teamId: 'new-id',
      teamName: 'IT Operations',
      history: [{ action: 'Submitted' }, { at: '2026-10-01T10:00:00.000Z', byId: 'a1', byName: 'Admin', action: 'Linked to team IT Operations' }]
    });
    expect(writes.addTeam).toHaveBeenCalledWith(expect.objectContaining({ name: 'IT Operations' }));
    expect(writes.updateService).toHaveBeenCalledWith('s1', { teamIds: ['new-id'], teamId: '', ownerTeam: '' });
    expect(writes.updateService).toHaveBeenCalledWith('s3', { teamIds: ['data'], teamId: '', ownerTeam: '' });
    expect(writes.updateUser).toHaveBeenCalledWith('u1', { teamId: 'new-id', team: 'IT Operations' });
  });
});
