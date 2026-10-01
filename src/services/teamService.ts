// Team (workspace) records and renaming, which also updates the names stored on members and services
import { Service, Team, User } from '../types';
import { DEFAULT_CRITERIA, DEFAULT_THRESHOLDS, validateModel } from '../lib/priority';
import { UNASSIGNED_TEAM } from '../lib/demand';

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
    ...ctx.services.filter(s => s.teamId === team.id).map(s => writes.updateService(s.id, { ownerTeam: name }))
  ]);
};
