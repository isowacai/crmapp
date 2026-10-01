// Pure planning logic for migration 001 (teams + demand pipeline). No Firestore access here, so it
// can be unit-tested; scripts/migrations/001-teams-and-pipeline.js reads the data and applies the plan.

export const UNASSIGNED_TEAM = 'Unassigned';

export const STATUS_MAP = {
  submitted: 'new',
  assigned: 'committed',
  'on-hold': 'blocked',
  rejected: 'declined'
  // in-progress, completed, cancelled keep their names
};

export const PRIORITY_MAP = { P1: 'critical', P2: 'high', P3: 'medium', P4: 'low' };

const PRIORITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

export const slugify = name =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'team';

const uniqueId = (base, taken) => {
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
};

/**
 * @param {{ users: {id:string,data:object}[], services: {id:string,data:object}[],
 *           requests: {id:string,data:object}[], teams: {id:string,data:object}[] }} input
 * @param {Date} now
 */
export const planMigration = ({ users, services, requests, teams }, now = new Date()) => {
  const at = now.toISOString();

  // ---- Teams: one per distinct team name on users and services ----
  const byName = new Map(teams.map(t => [String(t.data.name).toLowerCase(), { id: t.id, name: t.data.name }]));
  const takenIds = new Set(teams.map(t => t.id));
  const teamsToCreate = [];

  const names = [
    ...users.map(u => u.data.team),
    ...services.map(s => s.data.ownerTeam)
  ].filter(n => typeof n === 'string' && n.trim() && n.trim().toLowerCase() !== UNASSIGNED_TEAM.toLowerCase());

  for (const raw of names) {
    const name = raw.trim();
    if (byName.has(name.toLowerCase())) continue;
    const id = uniqueId(slugify(name), takenIds);
    byName.set(name.toLowerCase(), { id, name });
    teamsToCreate.push({ id, data: { name, description: '', managerIds: [] } });
  }

  const teamFor = name => (typeof name === 'string' ? byName.get(name.trim().toLowerCase()) : undefined);

  // Leads/managers run their team's workspace
  for (const t of teamsToCreate) {
    t.data.managerIds = users
      .filter(u => ['manager', 'lead'].includes(u.data.role) && teamFor(u.data.team)?.id === t.id)
      .map(u => u.id);
  }

  // ---- Users and services get teamId ----
  const userTeam = new Map();
  const userUpdates = [];
  for (const u of users) {
    const team = u.data.teamId ? { id: u.data.teamId } : teamFor(u.data.team);
    if (team) userTeam.set(u.id, team.id);
    if (!u.data.teamId && team) userUpdates.push({ id: u.id, patch: { teamId: team.id, team: team.name } });
  }

  const serviceTeam = new Map();
  const serviceUpdates = [];
  for (const s of services) {
    const team = s.data.teamId ? { id: s.data.teamId, name: s.data.ownerTeam } : teamFor(s.data.ownerTeam);
    if (team) serviceTeam.set(s.id, team);
    if (!s.data.teamId && team) serviceUpdates.push({ id: s.id, patch: { teamId: team.id, ownerTeam: team.name } });
  }
  const unlinkedServices = services.filter(s => !serviceTeam.has(s.id)).map(s => s.id);

  // ---- Requests: owning team, pipeline status, priority model ----
  const teamName = id => [...byName.values()].find(t => t.id === id)?.name ?? '';
  const requestUpdates = [];
  const unownedRequests = [];

  for (const r of requests) {
    const d = r.data;
    const patch = {};
    const changes = [];

    if (!d.teamId) {
      const team = serviceTeam.get(d.serviceId) ?? (d.assigneeId && userTeam.has(d.assigneeId) ? { id: userTeam.get(d.assigneeId) } : undefined);
      if (team) {
        patch.teamId = team.id;
        patch.teamName = team.name || teamName(team.id);
      } else {
        unownedRequests.push(r.id);
      }
    }

    const newStatus = STATUS_MAP[d.status];
    if (newStatus) {
      patch.status = newStatus;
      changes.push({ field: 'status', from: d.status, to: newStatus });
    }

    const level = PRIORITY_MAP[d.priority];
    if (level) {
      // Keep the previous priority, clearly marked as manager-assigned rather than recalculated
      patch.priority = level;
      patch.priorityOverride = {
        level,
        reason: `Carried over from the previous impact × urgency priority (${d.priority})`,
        byId: 'migration',
        byName: 'Migration',
        at
      };
      patch.calculatedPriority = '';
      patch.priorityScore = null;
      changes.push({ field: 'priority', from: d.priority, to: level });
    }
    if (d.priority === undefined) patch.priority = '';
    if (d.priorityScore === undefined && !('priorityScore' in patch)) patch.priorityScore = null;
    if (d.calculatedPriority === undefined && !('calculatedPriority' in patch)) patch.calculatedPriority = '';
    if (d.priorityOverride === undefined && !('priorityOverride' in patch)) patch.priorityOverride = null;
    if (!Array.isArray(d.assessments)) patch.assessments = [];

    if (Object.keys(patch).length === 0) continue;

    if (changes.length) {
      patch.history = [
        ...(d.history || []),
        {
          at,
          byId: 'migration',
          byName: 'Migration',
          action: `Moved to the demand pipeline${level ? `; priority kept as ${PRIORITY_LABEL[level]}` : ''}`,
          ...(newStatus ? { toStatus: newStatus } : {}),
          changes
        }
      ];
    }
    requestUpdates.push({ id: r.id, patch });
  }

  return { teamsToCreate, userUpdates, serviceUpdates, requestUpdates, unlinkedServices, unownedRequests };
};
