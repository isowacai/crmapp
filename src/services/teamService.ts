// Team (workspace) records and renaming, which also updates the names stored on members and services
import { ServiceRequest, Service, Team, User } from '../types';
import { DEFAULT_CRITERIA, DEFAULT_THRESHOLDS, validateModel } from '../lib/priority';
import { UNASSIGNED_TEAM } from '../lib/demand';
import { deliveringTeamIds, deliversService, teamIdsPatch } from '../lib/catalog';

export const newTeam = (name: string, managerIds: string[] = []): Omit<Team, 'id'> => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A team needs a name.');
  if (trimmed.toLowerCase() === UNASSIGNED_TEAM.toLowerCase()) throw new Error(`"${UNASSIGNED_TEAM}" is reserved for people without a team.`);
  return {
    name: trimmed,
    description: '',
    managerIds,
    assessmentCriteria: DEFAULT_CRITERIA,
    priorityThresholds: DEFAULT_THRESHOLDS
  };
};

export const checkModel = (team: Pick<Team, 'assessmentCriteria' | 'priorityThresholds'>) => {
  const problems = validateModel(team.assessmentCriteria, team.priorityThresholds);
  if (problems.length) throw new Error(problems[0]);
};

export interface TeamWrites {
  updateTeam: (id: string, data: Partial<Team>) => Promise<unknown>;
  addTeam: (data: Omit<Team, 'id'>) => Promise<{ id: string }>;
  updateUser: (id: string, data: Partial<User>) => Promise<unknown>;
  updateService: (id: string, data: Partial<Service>) => Promise<unknown>;
}

export interface TeamLinkPlan {
  teamsToCreate: string[]; // team names
  serviceLinks: { serviceId: string; teamName: string }[];
  userLinks: { userId: string; teamName: string }[];
  requestLinks: { request: ServiceRequest; teamName: string }[]; // existing demand, via its service
  unlinkable: Service[]; // services with no team name to go on; an admin picks one
}

// Links services (and people) that only have a team *name* to team records, creating teams as needed.
// The in-app counterpart of migration 001 for services and users.
export const planTeamLinks = (services: Service[], users: User[], teams: Team[], requests: ServiceRequest[] = []): TeamLinkPlan => {
  const known = new Map(teams.map(t => [t.name.trim().toLowerCase(), t.name]));
  const teamsToCreate: string[] = [];
  const nameFor = (raw: string) => {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!known.has(key)) {
      known.set(key, name);
      teamsToCreate.push(name);
    }
    return known.get(key)!;
  };
  const usable = (name?: string) => !!name && !!name.trim() && name.trim().toLowerCase() !== UNASSIGNED_TEAM.toLowerCase();

  const unlinked = services.filter(s => deliveringTeamIds(s).length === 0);
  const serviceLinks = unlinked.filter(s => usable(s.ownerTeam)).map(s => ({ serviceId: s.id, teamName: nameFor(s.ownerTeam!) }));
  const userLinks = users.filter(u => !u.teamId && usable(u.team)).map(u => ({ userId: u.id, teamName: nameFor(u.team!) }));
  // Existing requests follow their service's team (already linked, or being linked now). A service
  // delivered by several teams can't say which one an old request was meant for, so those are skipped.
  const serviceTeam = new Map<string, string>([
    ...services
      .filter(s => deliveringTeamIds(s).length === 1)
      .map(s => [s.id, teams.find(t => t.id === deliveringTeamIds(s)[0])?.name ?? s.ownerTeam ?? ''] as [string, string])
      .filter(([, name]) => !!name),
    ...serviceLinks.map(l => [l.serviceId, l.teamName] as [string, string])
  ]);
  const requestLinks = requests
    .filter(r => !r.teamId && serviceTeam.has(r.serviceId))
    .map(r => ({ request: r, teamName: serviceTeam.get(r.serviceId)! }));

  return { teamsToCreate, serviceLinks, userLinks, requestLinks, unlinkable: unlinked.filter(s => !usable(s.ownerTeam)) };
};

export const applyTeamLinks = async (
  plan: TeamLinkPlan,
  teams: Team[],
  writes: TeamWrites & { updateRequest?: (id: string, data: Partial<ServiceRequest>) => Promise<unknown> },
  actor?: { id: string; name: string },
  now = new Date()
) => {
  const idByName = new Map(teams.map(t => [t.name.trim().toLowerCase(), t.id]));
  for (const name of plan.teamsToCreate) {
    const created = await writes.addTeam(newTeam(name));
    idByName.set(name.toLowerCase(), created.id);
  }
  const id = (name: string) => idByName.get(name.toLowerCase())!;
  await Promise.all([
    ...plan.serviceLinks.map(l => writes.updateService(l.serviceId, teamIdsPatch([id(l.teamName)]))),
    ...plan.userLinks.map(l => writes.updateUser(l.userId, { teamId: id(l.teamName), team: l.teamName }))
  ]);
  // Requests record the change in their history (every request update appends one entry)
  if (writes.updateRequest && actor) {
    await Promise.all(
      plan.requestLinks.map(({ request, teamName }) =>
        writes.updateRequest!(request.id, {
          teamId: id(teamName),
          teamName,
          history: [
            ...(request.history || []),
            { at: now.toISOString(), byId: actor.id, byName: actor.name, action: `Linked to team ${teamName}` }
          ]
        })
      )
    );
  }
};

// Renames a team, or gives everyone without a team ("Unassigned") a team — an existing one, or a new
// one when the caller may create teams. Merging two real teams isn't supported here because their
// demand would need moving too.
export const renameTeam = async (
  oldName: string,
  newName: string,
  ctx: { teams: Team[]; users: User[]; services: Service[]; canCreate: boolean },
  writes: TeamWrites
): Promise<void> => {
  const name = newName.trim();
  if (!name) throw new Error('Enter a team name.');
  if (name.toLowerCase() === UNASSIGNED_TEAM.toLowerCase()) throw new Error(`"${UNASSIGNED_TEAM}" is reserved for people without a team.`);
  const existing = ctx.teams.find(t => t.name.toLowerCase() === name.toLowerCase());

  if (oldName === UNASSIGNED_TEAM) {
    let target = existing;
    if (!target) {
      if (!ctx.canCreate) throw new Error('Only admins can create teams. Choose an existing team, or ask an admin to create it.');
      const data = newTeam(name);
      target = { ...data, id: (await writes.addTeam(data)).id };
    }
    const unassigned = ctx.users.filter(u => !u.teamId);
    await Promise.all(unassigned.map(u => writes.updateUser(u.id, { teamId: target!.id, team: target!.name })));
    return;
  }

  const team = ctx.teams.find(t => t.name === oldName);
  if (!team) throw new Error(`Team "${oldName}" wasn't found. Run the team migration first.`);
  if (existing && existing.id !== team.id) {
    throw new Error(`A team called "${existing.name}" already exists. To combine teams, move people and services to it individually.`);
  }

  await writes.updateTeam(team.id, { name });
  await Promise.all([
    ...ctx.users.filter(u => u.teamId === team.id).map(u => writes.updateUser(u.id, { team: name })),
    // Services show team names from the team records; older single-team services still stored the name,
    // so convert them to the team list while we're here
    ...ctx.services
      .filter(s => deliversService(s, team.id) && !Array.isArray(s.teamIds))
      .map(s => writes.updateService(s.id, teamIdsPatch(deliveringTeamIds(s))))
  ]);
};
