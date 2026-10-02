// Replaces the app's demand data with a realistic Release 1 scenario: one DevOps team that takes
// demand from three lines of business (HCM, Productions, Corporate), with requests at every stage.
//
//   npm run seed-sample-data            preview only
//   npm run seed-sample-data -- --apply replace the data (run `npm run backup-data` first)
//
// Keeps every user account (and their roles); puts them all on the one team. Deletes all other
// teams, services, categories, requests, and request counters. Requests are built with the app's own
// commands, so their history, priority, and capacity data match what the app would have written.
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, projectId } from '../config/firebaseAdmin.js';
import * as commands from '../src/services/requestCommands';
import { DEFAULT_CRITERIA, DEFAULT_THRESHOLDS } from '../src/lib/priority';
import { toDateKey } from '../src/lib/demand';
import type { AssessInput, OutcomeInput } from '../src/services/requestCommands';
import type { RequestField, Service, ServiceRequest, Team, User } from '../src/types';

const APPLY = process.argv.includes('--apply');
const TEAM_NAME = 'DevOps';
const LINES_OF_BUSINESS = ['Corporate', 'HCM', 'Productions'];

// ---------- Dates relative to today ----------
const NOW = new Date();
const at = (days: number, hour = 10) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const dateKey = (days: number) => toDateKey(at(days));

// ---------- Catalog ----------
const field = (id: string, label: string, type: RequestField['type'], required: boolean, options: string[] = [], help = ''): RequestField => ({
  id, label, type, required, options, help
});

const CATEGORIES = ['Source Control', 'CI/CD', 'Release & Deployment', 'Environments', 'Collaboration', 'Advisory'];

const SERVICES: Record<string, Omit<Service, 'id' | 'teamIds'>> = {
  repo: {
    name: 'Repository setup', category: 'Source Control', active: true,
    description: 'New Git repositories with branch policies, access groups, and a starter README.',
    requestFields: [field('q1', 'Repository name(s)', 'text', true), field('q2', 'Visibility', 'select', true, ['Private', 'Internal'])]
  },
  ci: {
    name: 'CI build pipeline', category: 'CI/CD', active: true,
    description: 'Automated build, unit tests, code scanning, and packaging on every commit.',
    requestFields: [field('q1', 'Technology', 'select', true, ['.NET', 'Java', 'Node.js', 'Python']), field('q2', 'Repository', 'text', false)]
  },
  release: {
    name: 'Automated release pipeline', category: 'Release & Deployment', active: true,
    description: 'Deployment pipeline with approvals and rollback, from test through production.',
    requestFields: [field('q1', 'Furthest environment', 'select', true, ['Test', 'UAT', 'Production'])]
  },
  database: {
    name: 'Database deployment automation', category: 'Release & Deployment', active: true,
    description: 'Version-controlled schema changes deployed by pipeline instead of by hand.',
    requestFields: []
  },
  environment: {
    name: 'Test environment provisioning', category: 'Environments', active: true,
    description: 'A new or refreshed non-production environment built from infrastructure as code.',
    requestFields: [field('q1', 'Environment type', 'select', true, ['Test', 'UAT', 'Performance', 'Training', 'Sandbox']), field('q2', 'Needed until', 'date', false)]
  },
  boards: {
    name: 'Azure Boards project setup', category: 'Collaboration', active: true,
    description: 'A Boards project with the team’s process, areas, iterations, and dashboards.',
    requestFields: []
  },
  troubleshoot: {
    name: 'Pipeline troubleshooting', category: 'CI/CD', active: true,
    description: 'Investigate and fix failing or slow builds and deployments.',
    requestFields: []
  },
  assessment: {
    name: 'DevOps maturity assessment', category: 'Advisory', active: true,
    description: 'Review of an application’s build, release, and operating practices, with a prioritized roadmap.',
    requestFields: []
  }
};
type ServiceKey = keyof typeof SERVICES;

// People in the lines of business who raise demand (they don't need accounts for sample data)
const REQUESTERS = {
  amina: { id: 'sample-amina', displayName: 'Amina Yusuf', team: 'HCM · Payroll Applications' },
  daniel: { id: 'sample-daniel', displayName: 'Daniel Okafor', team: 'HCM · Talent Systems' },
  priya: { id: 'sample-priya', displayName: 'Priya Raman', team: 'Productions · Production Planning' },
  marco: { id: 'sample-marco', displayName: 'Marco Silva', team: 'Productions · Plant Systems' },
  laura: { id: 'sample-laura', displayName: 'Laura Chen', team: 'Corporate · Finance Systems' },
  omar: { id: 'sample-omar', displayName: 'Omar Haddad', team: 'Corporate · IT Security' }
};
type RequesterKey = keyof typeof REQUESTERS;

// Assessment scores: business value, urgency, strategic alignment, risk reduction, complexity (1–5)
const scores = (businessValue: number, urgency: number, strategicAlignment: number, riskReduction: number, complexity: number) => ({
  businessValue, urgency, strategicAlignment, riskReduction, complexity
});

// Who does what in the scenario: 'manager' assesses and plans; engineers deliver
type Engineer = 'lead' | 'engineer' | 'senior';
type Step =
  | {
      day: number;
      do: 'assess';
      scores: AssessInput['scores'];
      hours: number;
      decision?: AssessInput['decision'];
      note?: string;
      revisitIn?: number;
      benefit?: [number, string]; // expected hours saved per month, and what it saves
    }
  | { day: number; do: 'plan' | 'commit'; who: Engineer; hours: number; start: number; due: number; note?: string }
  | { day: number; do: 'start' }
  | { day: number; do: 'log'; hours: number; note: string }
  | { day: number; do: 'progress'; value: number; note: string }
  | { day: number; do: 'milestone'; title: string; due: number; done?: number }
  | { day: number; do: 'block'; reason: string }
  | { day: number; do: 'complete'; hours: number; note: string }
  | { day: number; do: 'outcome'; outcome: OutcomeInput }
  | { day: number; do: 'cancel'; reason: string }
  | { day: number; do: 'comment'; text: string };

interface Scenario {
  day: number; // days from today it was raised (negative = past)
  service: ServiceKey;
  lob: string;
  by: RequesterKey;
  title: string;
  description: string;
  why: string;
  neededIn?: number; // days from today
  answers?: Record<string, string>;
  steps?: Step[];
}

const SCENARIOS: Scenario[] = [
  // ---- Delivered ----
  {
    day: -76, service: 'repo', lob: 'HCM', by: 'amina', title: 'Git repositories for the Payroll modernisation programme',
    description: 'Three repositories (payroll-api, payroll-web, payroll-infra) moving off the old file share.',
    why: 'Programme kick-off is blocked until the code is under version control.', neededIn: -65,
    answers: { q1: 'payroll-api, payroll-web, payroll-infra', q2: 'Private' },
    steps: [
      { day: -75, do: 'assess', scores: scores(4, 5, 5, 3, 1), hours: 6, benefit: [6, 'Manual merges and changes lost on the file share'] },
      { day: -75, do: 'commit', who: 'engineer', hours: 6, start: -73, due: -69 },
      { day: -73, do: 'start' },
      { day: -70, do: 'complete', hours: 5, note: 'Repositories, branch policies, and access groups in place.' },
      { day: -60, do: 'outcome', outcome: { hoursSavedPerMonth: 6, types: ['time-saved', 'risk-reduced'], metrics: [{ type: 'time-saved', value: 6, unit: 'hours', description: 'per month on manual merges' }], summary: 'Payroll code is versioned and reviewed; no more lost changes from the file share.' } }
    ]
  },
  {
    day: -71, service: 'ci', lob: 'Productions', by: 'marco', title: 'CI pipeline for the MES integration service',
    description: 'Build and test the Java integration between the plant MES and SAP on every pull request.',
    why: 'Broken builds reach the plant test system weekly.', neededIn: -45,
    answers: { q1: 'Java', q2: 'mes-integration' },
    steps: [
      { day: -69, do: 'assess', scores: scores(4, 4, 4, 4, 3), hours: 24, benefit: [20, 'Failed plant test deployments and reruns'] },
      { day: -66, do: 'commit', who: 'lead', hours: 24, start: -64, due: -50 },
      { day: -64, do: 'start' },
      { day: -60, do: 'log', hours: 10, note: 'Maven build and unit tests running.' },
      { day: -55, do: 'log', hours: 12, note: 'Added SonarQube scan and artifact publishing.' },
      { day: -51, do: 'complete', hours: 6, note: 'Pipeline live for all branches; team trained.' },
      { day: -40, do: 'outcome', outcome: { hoursSavedPerMonth: 16, types: ['productivity', 'risk-reduced'], metrics: [{ type: 'productivity', value: 30, unit: '%', description: 'fewer failed plant test deployments' }], summary: 'Failures are caught on the pull request instead of in the plant test system.' } }
    ]
  },
  {
    day: -66, service: 'boards', lob: 'Corporate', by: 'laura', title: 'Azure Boards for the Finance month-end close project',
    description: 'Boards project with epics per close activity and a burndown dashboard for the controller.',
    why: 'The close project is tracked in spreadsheets that nobody trusts.', neededIn: -55,
    steps: [
      { day: -65, do: 'assess', scores: scores(3, 3, 3, 1, 1), hours: 8, benefit: [8, 'Spreadsheet tracking of the close'] },
      { day: -64, do: 'commit', who: 'engineer', hours: 8, start: -62, due: -58 },
      { day: -62, do: 'start' },
      { day: -59, do: 'complete', hours: 7, note: 'Project, areas, and dashboard set up; walkthrough done with Finance.' }
    ]
  },
  {
    day: -62, service: 'release', lob: 'HCM', by: 'daniel', title: 'Automated deployment for the Time & Attendance API',
    description: 'Replace the manual weekend deployment with a pipeline from Test to Production with approvals.',
    why: 'Manual releases take 4 hours of overtime and failed twice last quarter.', neededIn: -30,
    answers: { q1: 'Production' },
    steps: [
      { day: -60, do: 'assess', scores: scores(5, 4, 5, 5, 4), hours: 40, benefit: [16, 'Weekend overtime for manual releases'] },
      { day: -57, do: 'commit', who: 'lead', hours: 40, start: -55, due: -34 },
      { day: -55, do: 'start' },
      { day: -54, do: 'milestone', title: 'Test and UAT stages', due: -46, done: -46 },
      { day: -54, do: 'milestone', title: 'Production with approvals and rollback', due: -36, done: -35 },
      { day: -48, do: 'log', hours: 16, note: 'Test and UAT stages done.' },
      { day: -40, do: 'log', hours: 18, note: 'Production stage with approval gates.' },
      { day: -35, do: 'complete', hours: 10, note: 'First production release went out in 12 minutes.' },
      { day: -25, do: 'outcome', outcome: { hoursSavedPerMonth: 16, types: ['time-saved', 'risk-reduced'], metrics: [{ type: 'time-saved', value: 16, unit: 'hours', description: 'of weekend overtime per month' }], summary: 'Releases are routine weekday events with one-click rollback.' } }
    ]
  },
  {
    day: -55, service: 'environment', lob: 'Corporate', by: 'laura', title: 'UAT environment for the Treasury system upgrade',
    description: 'UAT copy of Treasury with masked production data for the vendor upgrade.',
    why: 'Vendor upgrade testing starts in three weeks.', neededIn: -38,
    answers: { q1: 'UAT', q2: dateKey(-10) },
    steps: [
      { day: -54, do: 'assess', scores: scores(4, 5, 3, 3, 2), hours: 16 },
      { day: -53, do: 'commit', who: 'senior', hours: 16, start: -50, due: -41 },
      { day: -50, do: 'start' },
      { day: -46, do: 'log', hours: 10, note: 'Infrastructure built from templates.' },
      { day: -41, do: 'complete', hours: 8, note: 'Environment handed over with masked data.' }
    ]
  },
  {
    day: -45, service: 'assessment', lob: 'Corporate', by: 'omar', title: 'DevOps assessment for Corporate applications',
    description: 'Assess build, release, and access practices across the 12 Corporate applications.',
    why: 'Audit finding: inconsistent change control on finance applications.', neededIn: -15,
    steps: [
      { day: -43, do: 'assess', scores: scores(5, 3, 5, 5, 3), hours: 30 },
      { day: -40, do: 'commit', who: 'lead', hours: 30, start: -38, due: -18 },
      { day: -38, do: 'start' },
      { day: -32, do: 'log', hours: 14, note: 'Interviews with six application teams.' },
      { day: -25, do: 'log', hours: 12, note: 'Findings and roadmap drafted.' },
      { day: -20, do: 'complete', hours: 6, note: 'Roadmap presented to the Corporate IT leadership team.' },
      { day: -12, do: 'outcome', outcome: { types: ['compliance', 'business-benefit'], metrics: [], summary: 'Audit finding closed; a 6-month improvement roadmap was agreed.' } }
    ]
  },
  {
    day: -30, service: 'troubleshoot', lob: 'Productions', by: 'priya', title: 'Nightly build failing for the Plant Scheduler',
    description: 'The nightly build has failed for 5 days with a dependency resolution error.',
    why: 'No fixes can be shipped to the plants until the build is green.', neededIn: -27,
    steps: [
      { day: -30, do: 'assess', scores: scores(3, 5, 2, 3, 1), hours: 4, benefit: [10, 'Developers re-running and patching failed builds'] },
      { day: -30, do: 'commit', who: 'engineer', hours: 4, start: -29, due: -28 },
      { day: -29, do: 'start' },
      { day: -28, do: 'complete', hours: 6, note: 'Pinned the package feed version and cleaned the agent cache.' }
    ]
  },

  // ---- Being delivered ----
  {
    day: -28, service: 'database', lob: 'HCM', by: 'amina', title: 'Automate SQL schema releases for the Benefits portal',
    description: 'Move the Benefits portal database changes into source control and deploy them by pipeline.',
    why: 'Hand-run scripts caused two outages during open enrolment.', neededIn: 14,
    steps: [
      { day: -26, do: 'assess', scores: scores(5, 4, 4, 5, 4), hours: 40, benefit: [12, 'Hand-run scripts and outage clean-up'] },
      { day: -21, do: 'commit', who: 'senior', hours: 40, start: -18, due: 10 },
      { day: -18, do: 'start' },
      { day: -18, do: 'milestone', title: 'Schema in source control', due: -10, done: -9 },
      { day: -18, do: 'milestone', title: 'Pipeline to UAT', due: 2 },
      { day: -18, do: 'milestone', title: 'Production go-live', due: 10 },
      { day: -12, do: 'log', hours: 12, note: 'Baseline schema extracted.' },
      { day: -5, do: 'log', hours: 10, note: 'Migration scripts and test stage.' },
      { day: -4, do: 'progress', value: 55, note: 'UAT stage next.' }
    ]
  },
  {
    day: -25, service: 'release', lob: 'Productions', by: 'priya', title: 'Blue/green deployment for the Quality Inspection app',
    description: 'Zero-downtime releases so inspections are not interrupted during shifts.',
    why: 'Plants run 24/7; every release currently stops inspections for 30 minutes.', neededIn: 7,
    answers: { q1: 'Production' },
    steps: [
      { day: -24, do: 'assess', scores: scores(5, 5, 4, 4, 3), hours: 32, benefit: [20, 'Inspection downtime during releases'] },
      { day: -20, do: 'commit', who: 'lead', hours: 32, start: -15, due: 5 },
      { day: -15, do: 'start' },
      { day: -10, do: 'log', hours: 12, note: 'Second slot and traffic switch configured.' },
      { day: -3, do: 'log', hours: 8, note: 'Smoke tests before switching.' },
      { day: -3, do: 'progress', value: 60, note: 'Production dry run planned for Friday.' }
    ]
  },
  {
    day: -20, service: 'ci', lob: 'Corporate', by: 'laura', title: 'CI for Expense Management (.NET 8)',
    description: 'Build, test, and package the new Expense Management service.',
    why: 'The project moves to user testing next month.', neededIn: 20,
    answers: { q1: '.NET', q2: 'expense-management' },
    steps: [
      { day: -18, do: 'assess', scores: scores(3, 3, 4, 2, 2), hours: 20, benefit: [5, 'Manual builds and packaging'] },
      { day: -12, do: 'commit', who: 'engineer', hours: 20, start: -7, due: 12 },
      { day: -7, do: 'start' },
      { day: -2, do: 'log', hours: 6, note: 'Build and unit tests running.' },
      { day: -2, do: 'progress', value: 30, note: 'Code scanning next.' }
    ]
  },
  {
    day: -18, service: 'environment', lob: 'HCM', by: 'daniel', title: 'Performance test environment for Payroll',
    description: 'Production-sized environment to load test the year-end payroll run.',
    why: 'Year-end payroll must complete inside the 6-hour window.', neededIn: 21,
    answers: { q1: 'Performance', q2: dateKey(60) },
    steps: [
      { day: -17, do: 'assess', scores: scores(4, 4, 3, 5, 3), hours: 24 },
      { day: -14, do: 'commit', who: 'senior', hours: 24, start: -10, due: 8 },
      { day: -10, do: 'start' },
      { day: -7, do: 'log', hours: 8, note: 'Templates sized for production volumes.' },
      { day: -3, do: 'block', reason: 'Waiting for Corporate IT to approve the cloud subscription quota increase.' }
    ]
  },

  // ---- Committed and planned ----
  {
    day: -14, service: 'repo', lob: 'Productions', by: 'marco', title: 'Monorepo migration for the Line Control apps',
    description: 'Consolidate 9 small repositories for the line control apps into one with shared pipelines.',
    why: 'Changes across apps need 9 pull requests today.', neededIn: 30,
    answers: { q1: 'line-control', q2: 'Internal' },
    steps: [
      { day: -12, do: 'assess', scores: scores(3, 2, 4, 2, 4), hours: 36, benefit: [15, 'Coordinating changes across 9 repositories'] },
      { day: -6, do: 'commit', who: 'lead', hours: 36, start: 3, due: 24 }
    ]
  },
  {
    day: -12, service: 'release', lob: 'Corporate', by: 'laura', title: 'Release pipeline for the Procurement portal',
    description: 'Automated releases for the Procurement portal from Test to Production.',
    why: 'Supplier onboarding changes ship monthly and are deployed by hand.', neededIn: 35,
    answers: { q1: 'Production' },
    steps: [
      { day: -11, do: 'assess', scores: scores(4, 3, 4, 3, 3), hours: 28, benefit: [8, 'Manual monthly deployments'] },
      { day: -4, do: 'commit', who: 'engineer', hours: 28, start: 7, due: 28 }
    ]
  },
  {
    day: -10, service: 'ci', lob: 'HCM', by: 'daniel', title: 'CI for the Onboarding mobile app (Node.js)',
    description: 'Build and test pipeline for the new hire onboarding app.',
    why: 'The app goes to pilot with two business units next quarter.', neededIn: 45,
    answers: { q1: 'Node.js', q2: 'onboarding-mobile' },
    steps: [
      { day: -9, do: 'assess', scores: scores(3, 2, 4, 2, 2), hours: 20, benefit: [4, 'Manual test builds for the pilot'] },
      { day: -5, do: 'plan', who: 'engineer', hours: 20, start: 14, due: 35, note: 'Tentative until the Procurement pipeline is done.' }
    ]
  },

  // ---- Approved, waiting to be planned ----
  {
    day: -8, service: 'environment', lob: 'Productions', by: 'priya', title: 'Training environment for the new Monterrey plant',
    description: 'Training copy of the plant systems for 40 new operators.',
    why: 'Operator training starts before the plant opens.', neededIn: 30,
    answers: { q1: 'Training', q2: dateKey(90) },
    steps: [{ day: -6, do: 'assess', scores: scores(4, 4, 4, 2, 2), hours: 16 }]
  },
  {
    day: -6, service: 'database', lob: 'Corporate', by: 'laura', title: 'Database release automation for GL reporting',
    description: 'Pipeline-driven database changes for the General Ledger reporting warehouse.',
    why: 'Reduce risk before the external audit.', neededIn: 60,
    steps: [{ day: -4, do: 'assess', scores: scores(4, 2, 4, 4, 4), hours: 30, benefit: [6, 'Manual database changes before audits'] }]
  },

  // ---- Intake ----
  {
    day: -5, service: 'assessment', lob: 'HCM', by: 'amina', title: 'Assess the release process for the Learning platform',
    description: 'Review how the Learning platform vendor releases are tested and deployed.',
    why: 'Recent vendor releases broke course enrolment.', neededIn: 40,
    steps: [
      { day: -3, do: 'assess', scores: {}, hours: 0, decision: 'more-info', note: 'Is the vendor in scope, or only our configuration and integrations?' }
    ]
  },
  {
    day: -2, service: 'troubleshoot', lob: 'Productions', by: 'marco', title: 'Intermittent test failures in the Maintenance app build',
    description: 'About 1 in 5 builds fail on UI tests that pass when re-run.',
    why: 'Developers re-run builds several times a day.', neededIn: 10
  },
  {
    day: -1, service: 'repo', lob: 'Corporate', by: 'omar', title: 'Repositories for the Tax automation scripts',
    description: 'Version control for the PowerShell and Python scripts used in tax filings.',
    why: 'Scripts are emailed between analysts.', neededIn: 20,
    answers: { q1: 'tax-automation', q2: 'Private' }
  },
  {
    day: -1, service: 'ci', lob: 'Productions', by: 'priya', title: 'CI pipeline for the Shop-floor dashboard',
    description: 'Build and test the Python dashboard that shows line output in real time.',
    why: 'Manual deployments to the plant screens are error-prone.', neededIn: 30,
    answers: { q1: 'Python', q2: 'shopfloor-dashboard' }
  },
  {
    day: 0, service: 'boards', lob: 'HCM', by: 'daniel', title: 'Azure Boards for the Recruiting system rollout',
    description: 'Boards project for the 5-country recruiting system rollout.',
    why: 'Rollout starts next month with three vendors involved.', neededIn: 14
  },

  // ---- Closed without delivery ----
  {
    day: -20, service: 'environment', lob: 'Corporate', by: 'omar', title: 'Sandbox environment for the Legal contracts tool',
    description: 'Sandbox to evaluate a contract management product.',
    why: 'Legal is evaluating vendors.', neededIn: 40,
    answers: { q1: 'Sandbox' },
    steps: [
      { day: -18, do: 'assess', scores: scores(2, 1, 2, 1, 2), hours: 12, decision: 'defer', note: 'Revisit once Legal has shortlisted a vendor.', revisitIn: 30 }
    ]
  },
  {
    day: -15, service: 'repo', lob: 'Productions', by: 'marco', title: 'Repository for shift report spreadsheets',
    description: 'Put the Excel shift reports into Git.',
    why: 'Keep a history of changes to the reports.',
    answers: { q1: 'shift-reports', q2: 'Internal' },
    steps: [
      { day: -14, do: 'assess', scores: scores(1, 1, 1, 1, 1), hours: 0, decision: 'decline', note: 'Spreadsheets are better kept in SharePoint, which already keeps version history.' }
    ]
  },
  {
    day: -35, service: 'release', lob: 'HCM', by: 'amina', title: 'Deployment automation for the legacy Leave tracker',
    description: 'Release pipeline for the old Leave tracker.',
    why: 'Manual deployments take half a day.',
    answers: { q1: 'Production' },
    steps: [
      { day: -33, do: 'assess', scores: scores(2, 2, 1, 2, 3), hours: 16, benefit: [4, 'Half-day manual deployments'] },
      { day: -25, do: 'cancel', reason: 'The Leave tracker is being retired; leave moves into the new HCM suite.' }
    ]
  }
];

// ---------- Build everything in memory ----------
const main = async () => {
  const [usersSnap, teamsSnap, servicesSnap, categoriesSnap, requestsSnap, countersSnap] = await Promise.all(
    ['users', 'teams', 'services', 'categories', 'requests', 'counters'].map(c => db.collection(c).get())
  );
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }) as User).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
  if (users.length === 0) throw new Error('No users found. Sign in to the app at least once first.');

  // Roles stay as they are; managers assess and plan, leads and staff deliver
  const managers = users.filter(u => u.role === 'manager' || u.role === 'admin');
  const manager = users.find(u => u.role === 'manager') ?? managers[0] ?? users[0];
  const delivery = users.filter(u => u.id !== manager.id && u.role !== 'admin');
  const pick = (...roles: string[]) => delivery.find(u => roles.includes(u.role)) ?? delivery[0] ?? manager;
  const engineers: Record<Engineer, User> = {
    lead: pick('lead'),
    engineer: pick('staff', 'customer'),
    senior: delivery.find(u => u.role === 'manager') ?? pick('lead')
  };

  // Keep the team most people already belong to (its ID stays valid), or create one
  const teamCounts = new Map<string, number>();
  for (const u of users) if (u.teamId) teamCounts.set(u.teamId, (teamCounts.get(u.teamId) ?? 0) + 1);
  const keepId = [...teamCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).find(id => teamsSnap.docs.some(d => d.id === id));
  const teamRef = keepId ? db.collection('teams').doc(keepId) : db.collection('teams').doc();
  const team: Team = {
    id: teamRef.id,
    name: TEAM_NAME,
    description: 'Source control, CI/CD, environments, and release automation for every line of business.',
    managerIds: users.filter(u => ['manager', 'lead'].includes(u.role)).map(u => u.id),
    assessmentCriteria: DEFAULT_CRITERIA,
    priorityThresholds: DEFAULT_THRESHOLDS,
    serviceTargets: { responseDays: 2, assessmentDays: 5, commitmentDays: 10, deliveryDays: 30 },
    hourlyRate: 85,
    savedHourValue: 55, // what an hour of the business's time is worth, for cost avoidance
    currency: 'USD',
    linesOfBusiness: LINES_OF_BUSINESS
  };
  const capacityOf = (u: User) => (u.id === manager.id ? 10 : u.role === 'admin' ? 8 : u.role === 'manager' ? 30 : u.role === 'lead' ? 32 : 40);
  const members = users.map(u => ({ ...u, teamId: team.id, team: TEAM_NAME, weeklyCapacityHours: capacityOf(u) }));
  const memberOf = (u: User) => members.find(m => m.id === u.id)!;

  const services = Object.fromEntries(
    Object.entries(SERVICES).map(([key, s]) => [key, { ...s, id: db.collection('services').doc().id, teamIds: [team.id] } as Service])
  ) as Record<ServiceKey, Service>;

  const model = { criteria: DEFAULT_CRITERIA, thresholds: DEFAULT_THRESHOLDS };
  const actor = (u: User) => ({ id: u.id, name: u.displayName || u.email });
  const counters = new Map<string, number>();
  const requests: { request: ServiceRequest; createdAt: Date }[] = [];

  for (const sc of [...SCENARIOS].sort((a, b) => a.day - b.day)) {
    const created = at(sc.day, 9);
    const dayId = toDateKey(created).replace(/-/g, '');
    const seq = (counters.get(dayId) ?? 0) + 1;
    counters.set(dayId, seq);
    const number = `REQ-${dayId}-${String(seq).padStart(4, '0')}`;
    const requester = { ...REQUESTERS[sc.by], email: '', role: 'staff', teamId: '' } as unknown as User;
    let r = {
      id: number,
      ...commands.createRequest(
        {
          title: sc.title,
          description: sc.description,
          businessJustification: sc.why,
          neededBy: sc.neededIn === undefined ? '' : dateKey(sc.neededIn),
          answers: sc.answers ?? {},
          lineOfBusiness: sc.lob
        },
        services[sc.service],
        team,
        requester,
        number,
        created
      ),
      createdAt: Timestamp.fromDate(created)
    } as unknown as ServiceRequest;
    const apply = (patch: commands.RequestPatch) => (r = { ...r, ...patch });

    for (const step of sc.steps ?? []) {
      const when = at(step.day, 14);
      const owner = r.assigneeId ? members.find(m => m.id === r.assigneeId)! : manager;
      switch (step.do) {
        case 'assess':
          apply(commands.assess(r, {
            scores: step.scores, estimatedHours: step.hours, dependencies: '', comments: step.note ?? '',
            decision: step.decision ?? 'accept', revisitOn: step.revisitIn ? dateKey(step.revisitIn) : '',
            ...(step.benefit ? { expectedBenefit: { hoursSavedPerMonth: step.benefit[0], description: step.benefit[1] } } : {})
          }, model, actor(manager), when));
          break;
        case 'plan':
        case 'commit':
          apply(commands.plan(r, {
            assignee: memberOf(engineers[step.who]), estimatedHours: step.hours, startDate: dateKey(step.start), dueDate: dateKey(step.due),
            note: step.note ?? '', commit: step.do === 'commit'
          }, actor(manager), when));
          break;
        case 'start': apply(commands.start(r, actor(owner), when)); break;
        case 'log': apply(commands.logHours(r, step.hours, step.note, actor(owner), when)); break;
        case 'progress': apply(commands.setProgress(r, step.value, step.note, actor(owner), when)); break;
        case 'milestone': {
          apply(commands.addMilestone(r, step.title, dateKey(step.due), actor(owner), when));
          if (step.done !== undefined) apply(commands.setMilestoneDone(r, r.milestones.at(-1)!.id, true, actor(owner), at(step.done, 15)));
          break;
        }
        case 'block': apply(commands.block(r, step.reason, actor(owner), when)); break;
        case 'complete': apply(commands.complete(r, step.hours, step.note, actor(owner), when)); break;
        case 'outcome': apply(commands.recordOutcome(r, step.outcome, actor(manager), when)); break;
        case 'cancel': apply(commands.cancel(r, step.reason, actor(manager), when)); break;
        case 'comment': apply(commands.comment(r, step.text, actor(manager), when)); break;
      }
    }
    // Histories are written in step order; keep them in time order for reading
    r.history = [...r.history].sort((a, b) => a.at.localeCompare(b.at));
    requests.push({ request: r, createdAt: created });
  }

  // ---------- Report ----------
  const byStatus = new Map<string, number>();
  for (const { request } of requests) byStatus.set(request.status, (byStatus.get(request.status) ?? 0) + 1);
  console.log(`\n[${projectId}] ${APPLY ? 'Replacing' : 'Preview of'} sample data`);
  console.log(`Remove: ${teamsSnap.size - (keepId ? 1 : 0)} other teams, ${servicesSnap.size} services, ${categoriesSnap.size} categories, ${requestsSnap.size} requests, ${countersSnap.size} counters`);
  console.log(`Team:   ${TEAM_NAME} (${keepId ? 'kept, ' + keepId : 'new'}) · lines of business ${LINES_OF_BUSINESS.join(', ')}`);
  console.log(`People: ${members.map(m => `${m.displayName} [${m.role}, ${m.weeklyCapacityHours}h/wk]`).join(' · ')}`);
  console.log(`        assesses/plans: ${manager.displayName} · delivers: ${[...new Set(Object.values(engineers).map(e => e.displayName))].join(', ')}`);
  console.log(`Add:    ${CATEGORIES.length} categories, ${Object.keys(services).length} services, ${requests.length} requests`);
  console.log(`        ${[...byStatus.entries()].map(([s, n]) => `${n} ${s}`).join(', ')}`);
  console.log(`        by LOB: ${LINES_OF_BUSINESS.map(l => `${l} ${requests.filter(x => x.request.lineOfBusiness === l).length}`).join(', ')}`);
  if (!APPLY) {
    console.log('\nNothing changed. Run `npm run backup-data`, then `npm run seed-sample-data -- --apply`.');
    return;
  }

  // ---------- Write ----------
  const writer = db.bulkWriter();
  for (const d of [...servicesSnap.docs, ...categoriesSnap.docs, ...requestsSnap.docs, ...countersSnap.docs]) writer.delete(d.ref);
  for (const d of teamsSnap.docs) if (d.id !== team.id) writer.delete(d.ref);
  await writer.flush();

  const teamData = Object.fromEntries(Object.entries(team).filter(([key]) => key !== 'id'));
  await teamRef.set({
    ...teamData,
    requestAccess: FieldValue.delete(), workflow: FieldValue.delete(), dashboardKpis: FieldValue.delete(), setupSteps: FieldValue.delete()
  }, { merge: true });
  for (const m of members) writer.update(db.collection('users').doc(m.id), { teamId: m.teamId, team: m.team, weeklyCapacityHours: m.weeklyCapacityHours });
  // createdAt is required: the app lists collections ordered by it, which leaves out documents without one
  for (const [i, name] of CATEGORIES.entries()) writer.create(db.collection('categories').doc(), { name, createdAt: Timestamp.fromDate(at(-90 + i)) });
  for (const { id, ...s } of Object.values(services)) writer.create(db.collection('services').doc(id), { ...s, createdAt: Timestamp.fromDate(at(-90)) });
  for (const { request } of requests) {
    const { id, ...data } = request;
    writer.create(db.collection('requests').doc(id), data);
  }
  for (const [day, last] of counters) writer.set(db.collection('counters').doc(`REQ-${day}`), { last });
  await writer.close();
  console.log('\nDone.');
};

main().then(
  () => process.exit(0),
  err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
