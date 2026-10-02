# DemandQ — Demand & Delivery Management

A lightweight platform for teams that provide services: staff request services from a catalog; each
team's leads and managers assess, prioritize, and plan that demand against their capacity, then track
delivery. Not a ticketing or ITSM tool. Built with React, TypeScript, Tailwind CSS, and Firebase.

## Lifecycle

```
New → Assessing → Approved → Planned → Committed → In progress → Completed
                  (also: Deferred, Declined, Cancelled, Blocked)
```

- **Assessing** means the team asked the requester for more information.
- **Approved** means the team agrees the work is valid; **Planned** has an owner and dates;
  **Committed** means capacity is allocated and the team intends to deliver.

## Features

- **Release 1 scope**: one delivery team taking demand from several lines of business (LOBs), e.g. HCM,
  Productions, and Corporate
- **Team page** (leads and managers): people and weekly capacity, the team's lines of business,
  prioritization, and optional targets and cost rate
- **Service catalog**: services grouped by category, with optional questions requesters answer up front.
  Requesters pick a service and a line of business; they never choose a team
- **Demand board and list**: the pipeline as a Kanban board or a filterable list (service, status,
  priority, owner, requester, line of business, dates); cards show priority, effort, target date, owner, and capacity impact
- **Assessment**: score each request against the team's criteria, estimate effort, note dependencies, and
  decide: Accept, Defer, Decline, or Request more information. Every assessment is kept.
- **Configurable prioritization** (Team page): each team sets its criteria, weights, scales, and
  Critical/High/Medium/Low thresholds. Requests get a 0–100 score and calculated priority; managers can
  override it with a reason, and both are shown.
- **Capacity-based commitment**: when assessing or committing, a capacity check compares the effort with
  the team's available capacity, existing committed work, and remaining capacity for the requested period,
  and warns when it doesn't fit; managers then commit, defer, reprioritize, change the target period, or
  reassign. Committed date and target period are recorded, with changes in the audit trail.
- **Delivery tracking** (lightweight): owner, planned vs. actual start and completion, estimated vs. actual
  effort with variance, progress, milestones, blockers (with how long they lasted), and a health signal
  (on track / at risk / late)
- **Dependencies and cross-team demand**: link requests a piece of work depends on; raise supporting requests
  for other teams' services (e.g. a security review) that follow that team's pipeline and capacity, while
  the original team keeps end-to-end visibility
- **Capacity**: per-person weekly capacity, committed vs. logged hours, team consumption
- **Forecast**: by month or quarter — available capacity, committed work, approved demand, remaining
  capacity, and the gap — with shortfalls highlighted and drill-down to the requests behind each number
- **Service targets** (optional, per team): initial response, assessment, commitment, and delivery, in
  calendar days, tracked per request and summarized on the dashboard
- **Effort and cost**: estimated vs. actual hours and (with team or personal hourly rates) cost, with variance
- **Outcomes and value**: after completion, record business benefit, cost avoidance, time saved, risk
  reduction, and more, with optional figures and a summary
- **Management dashboard**: Demand, Priority, Capacity, Delivery, Performance (time per lifecycle stage and
  where work waits), and Value sections; every figure drills down to the requests behind it
- **Audit trail**: status, priority, score, estimate, owner, and date changes are recorded with
  previous and new values, who, and when

## Roles

| Role | Can |
|---|---|
| Staff | Raise requests, track their own, reply to questions, and deliver work assigned to them |
| Lead / Manager | For **their own team**: assess, prioritize, plan, commit, and see capacity; manage the team on the Team page. Managers also edit their team's catalog services |
| Admin | Everything across all teams, plus users and creating teams |

Users stored with the old `customer` role are treated as Staff.

## Getting Started

Requires Node.js 18+.

```bash
npm install
npm run dev       # start the dev server at http://localhost:5173
npm run build     # type-check and build for production
npm run lint      # run ESLint
```

The app uses Firebase (Auth + Firestore). Its config is read from `dev.properties` in the project
root, which is shared by the app and the admin scripts. Restart `npm run dev` after changing it.

### Admin scripts

Node scripts in `scripts/` use the Firebase Admin SDK, so they work with security rules in place.
They need a service-account key: Firebase console → Project settings → Service accounts →
**Generate new private key**, saved as `config/serviceAccountKey.json` (git-ignored — never commit it).

```bash
npm run list-users                   # print users with role, team, and status
npm run set-admin <userId or email>  # give a user the admin role
npm run sync-users                   # preview profile fixes for every login (add `-- --apply` to save)
npm run load-services                # add a starter catalog, with its teams (skips anything that already exists)
npm run migrate:teams                # preview migration 001: teams + demand pipeline (add `-- --apply` to run it)
npm run backup-data                  # save every collection to backups/ (git-ignored)
npm run seed-sample-data             # preview replacing all demand data with the Release 1 sample scenario
                                     # (add `-- --apply` to replace it; keeps user accounts)
```

### Tests

```bash
npm test                 # business-logic unit tests (Vitest)
npm run test:rules       # Firestore security rules tests (starts the Firestore emulator; needs Java 11+)
npm run test:migration   # migration 001 end-to-end against the emulator
```

### Upgrading existing data

Run migration 001 once, **before** deploying the security rules, so every request and person has a team:

```bash
npm run migrate:teams              # preview what will change
npm run migrate:teams -- --apply   # apply it (safe to re-run)
```

Previous P1–P4 priorities are kept as manager priorities, labelled "carried over"; reassess requests to
get a calculated score.

### Security rules

Access is enforced by `firestore.rules`, not just by the UI:

- **Staff** raise requests and see only the requests they raised or are assigned to.
- **Leads and managers** see and manage only their own team's demand and team settings;
  **managers** also edit their team's catalog services.
- **Admins** see everything and manage users and teams. New accounts always start as staff.
- New requests must belong to the team that delivers their service, and arrive unassessed.
- Every request update must append one history entry written as the signed-in user.

Deploy the rules (and indexes) after testing them:

```bash
npx firebase login
npx firebase deploy --only firestore --project mycrmapp-32ca1
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
