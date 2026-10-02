import type { LucideIcon } from 'lucide-react';
import { Inbox, ListChecks, Gauge, Trophy, LayoutGrid, MessageSquare, Scale, Flag, CalendarRange, LineChart, AlarmClock, GitBranch, Timer, Coins, BarChart3, ShieldCheck } from 'lucide-react';

export interface FeatureContent {
  slug: string;
  icon: LucideIcon;
  title: string;
  summary: string; // one line for the landing page card
  description: string;
  points: { icon: LucideIcon; title: string; text: string }[];
}

// Public product pages, one per stage of the lifecycle
export const FEATURES: FeatureContent[] = [
  {
    slug: 'intake',
    icon: Inbox,
    title: 'Demand intake',
    summary: 'A catalog of the services your teams provide, so requests arrive complete and in one place.',
    description: 'Give people one clear way to ask your team for work, and see everything that is being asked of you.',
    points: [
      { icon: LayoutGrid, title: 'Service catalog', text: 'Each team publishes the services it provides. Requests go straight to the team that delivers them.' },
      { icon: MessageSquare, title: 'The right questions up front', text: 'Service-specific questions mean requests arrive with what the team needs to assess them.' },
      { icon: Inbox, title: 'One pipeline', text: 'Every request is numbered, tracked, and visible on a board from the moment it is raised.' },
      { icon: ShieldCheck, title: 'Controlled access', text: 'Teams choose who can request their services: everyone, or specific teams.' }
    ]
  },
  {
    slug: 'prioritization',
    icon: ListChecks,
    title: 'Assessment & prioritization',
    summary: 'Score demand against your own criteria to get a transparent, defensible priority.',
    description: 'Decide what to take on, and in what order, using criteria your team agrees on.',
    points: [
      { icon: Scale, title: 'Your criteria, your weights', text: 'Business value, urgency, strategic fit, risk, complexity — or your own. Each team configures its model.' },
      { icon: ListChecks, title: 'Structured decisions', text: 'Accept, defer, decline, or ask for more information, with every assessment kept.' },
      { icon: Flag, title: 'Managers stay in charge', text: 'A calculated score supports the decision; managers can override it with a reason, shown separately.' },
      { icon: BarChart3, title: 'Clear backlog', text: 'See critical and high demand that is not yet committed, at a glance.' }
    ]
  },
  {
    slug: 'capacity',
    icon: Gauge,
    title: 'Capacity & forecasting',
    summary: 'Commit only to what the team can deliver, and see shortfalls months ahead.',
    description: 'Compare demand with the capacity you actually have before you commit.',
    points: [
      { icon: Gauge, title: 'Capacity check at every decision', text: 'Effort vs. available, committed, and remaining capacity for the requested period — with a warning when it will not fit.' },
      { icon: CalendarRange, title: 'Monthly forecast', text: 'Available capacity, committed work, approved demand, and the gap, by month or quarter.' },
      { icon: LineChart, title: 'Team and person views', text: 'Weekly consumption for every team and person, planned and actual.' },
      { icon: Scale, title: 'Approve vs. commit', text: 'Approving says the work is valid; committing allocates capacity. Both are tracked.' }
    ]
  },
  {
    slug: 'value',
    icon: Trophy,
    title: 'Delivery & value',
    summary: 'Track delivery lightly, measure flow, and show the value your team provides.',
    description: 'Know what is being delivered, what is at risk, and what difference it made.',
    points: [
      { icon: AlarmClock, title: 'Delivery health', text: 'Progress, milestones, blockers, and dependencies — enough visibility without a project tool.' },
      { icon: GitBranch, title: 'Cross-team demand', text: 'Raise supporting requests for other teams while keeping end-to-end visibility.' },
      { icon: Timer, title: 'Flow and targets', text: 'Time in each stage, where work waits, and performance against your service targets.' },
      { icon: Coins, title: 'Outcomes and cost', text: 'Effort, cost, cost avoided, time saved, and business outcomes for completed work.' }
    ]
  }
];

// Paths of the original feature pages, redirected to their closest replacement
export const LEGACY_FEATURE_PATHS: Record<string, string> = {
  analytics: 'value',
  'customer-management': 'intake',
  'order-processing': 'prioritization',
  'task-management': 'capacity'
};
