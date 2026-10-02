import { Service, Team } from '../types';

export type ServiceFormData = Omit<Service, 'id'>;

// A blank service, optionally delivered by a given team
export const emptyService = (team?: Pick<Team, 'id'>): ServiceFormData => ({
  name: '',
  category: '',
  description: '',
  teamIds: team ? [team.id] : [],
  active: true,
  requestFields: []
});

// The teams that deliver a service. Services saved before multi-team delivery have only `teamId`.
export const deliveringTeamIds = (s: Pick<Service, 'teamIds' | 'teamId'>): string[] =>
  Array.isArray(s.teamIds) ? s.teamIds : s.teamId ? [s.teamId] : [];

export const deliversService = (s: Pick<Service, 'teamIds' | 'teamId'>, teamId: string | undefined) =>
  !!teamId && deliveringTeamIds(s).includes(teamId);

export const deliveringTeams = <T extends Pick<Team, 'id'>>(s: Pick<Service, 'teamIds' | 'teamId'>, teams: T[]): T[] =>
  deliveringTeamIds(s).map(id => teams.find(t => t.id === id)).filter((t): t is T => !!t);

// "IT Ops, Platform" — or the legacy stored name for services from before team records
export const deliveringTeamNames = (s: Pick<Service, 'teamIds' | 'teamId' | 'ownerTeam'>, teams: Pick<Team, 'id' | 'name'>[]) => {
  const names = deliveringTeams(s, teams).map(t => t.name);
  return names.length ? names.join(', ') : s.ownerTeam || 'No team yet';
};

// Fields to write when changing who delivers a service (clears the legacy single-team fields)
export const teamIdsPatch = (teamIds: string[]) => ({ teamIds: [...new Set(teamIds)], teamId: '', ownerTeam: '' });

// ---------- Routing by line of business ----------
// Requesters never choose a team. They say which line of business (LOB) the request is for, and it
// goes to the service's delivering team that serves that LOB. Each team lists its LOBs on the Team page.

export const linesOfBusinessOf = (team: Pick<Team, 'linesOfBusiness'> | undefined) => team?.linesOfBusiness ?? [];

// Every LOB any team serves, for the request form
export const allLinesOfBusiness = (teams: Pick<Team, 'linesOfBusiness'>[]) =>
  [...new Set(teams.flatMap(t => linesOfBusinessOf(t)))].sort((a, b) => a.localeCompare(b));

const sameLob = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The team that delivers `service` for `lob`:
//   1. the delivering team that lists the LOB
//   2. otherwise a delivering team that lists no LOBs (it takes everything)
//   3. otherwise, when only one team delivers the service, that team
export const routeRequest = <T extends Pick<Team, 'id' | 'name' | 'linesOfBusiness'>>(
  service: Pick<Service, 'teamIds' | 'teamId'>,
  lob: string,
  teams: T[]
): T | undefined => {
  const delivering = deliveringTeams(service, teams).sort((a, b) => a.name.localeCompare(b.name));
  return (
    (lob ? delivering.find(t => linesOfBusinessOf(t).some(l => sameLob(l, lob))) : undefined) ??
    delivering.find(t => linesOfBusinessOf(t).length === 0) ??
    (delivering.length === 1 ? delivering[0] : undefined)
  );
};
