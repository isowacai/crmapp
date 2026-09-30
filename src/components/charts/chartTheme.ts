// Chart colours. Validated for colour-blind separation on a white surface
// (categorical: adjacent CVD ΔE ≥ 9; ordinal ramp: monotone, light end ≥ 2:1).

// Categorical slots: assign in this fixed order and never cycle; fold extras into "Other"
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

// Neutral for "Other" / "Not set"
export const NEUTRAL = '#a3a29b';

// Ordinal blue ramp for P1 (darkest) → P4 (lightest)
export const PRIORITY_RAMP = { P1: '#104281', P2: '#256abf', P3: '#5598e7', P4: '#86b6ef' } as const;

// Reserved status colours; always paired with an icon or label
export const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' } as const;

export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7'
} as const;

// Rounds up to a "nice" axis maximum and returns evenly spaced ticks from 0
export const niceTicks = (max: number, count = 4): number[] => {
  if (max <= 0) return [0, 1];
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= rawStep) ?? rawStep;
  const niceStep = Math.max(step, 1); // counts are whole numbers
  const top = Math.ceil(max / niceStep) * niceStep;
  return Array.from({ length: Math.round(top / niceStep) + 1 }, (_, i) => i * niceStep);
};
