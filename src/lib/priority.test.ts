import { describe, expect, it } from 'vitest';
import {
  calculateScore,
  criterionKey,
  DEFAULT_CRITERIA,
  DEFAULT_THRESHOLDS,
  levelForScore,
  normalizedWeights,
  teamModel,
  validateModel
} from './priority';
import { AssessmentCriterion } from '../types';

const all = (value: number) => Object.fromEntries(DEFAULT_CRITERIA.map(c => [c.key, value]));

describe('calculateScore', () => {
  it('scores 100 when every "higher" criterion is maxed and complexity is minimal', () => {
    expect(calculateScore({ ...all(5), complexity: 1 }, DEFAULT_CRITERIA)).toBe(100);
  });

  it('scores 0 at the opposite extreme', () => {
    expect(calculateScore({ ...all(1), complexity: 5 }, DEFAULT_CRITERIA)).toBe(0);
  });

  it('applies weights', () => {
    // Only business value (30%) maxed, complexity (10%) at best; everything else at minimum → 40
    expect(calculateScore({ ...all(1), businessValue: 5, complexity: 1 }, DEFAULT_CRITERIA)).toBe(40);
  });

  it('ignores disabled and zero-weight criteria', () => {
    const criteria = DEFAULT_CRITERIA.map(c =>
      c.key === 'urgency' ? { ...c, enabled: false } : c.key === 'riskReduction' ? { ...c, weight: 0 } : c
    );
    const scores = { businessValue: 5, strategicAlignment: 5, complexity: 1 }; // urgency / risk not needed
    expect(calculateScore(scores, criteria)).toBe(100);
  });

  it('returns null until every active criterion is scored', () => {
    expect(calculateScore({ businessValue: 5 }, DEFAULT_CRITERIA)).toBeNull();
    expect(calculateScore({}, [])).toBeNull();
  });

  it('clamps out-of-range scores and supports custom ranges', () => {
    const tenPoint: AssessmentCriterion[] = [
      { key: 'impact', label: 'Impact', description: '', weight: 1, enabled: true, min: 0, max: 10, direction: 'higher' }
    ];
    expect(calculateScore({ impact: 7 }, tenPoint)).toBe(70);
    expect(calculateScore({ impact: 99 }, tenPoint)).toBe(100);
  });

  it('works on snapshotted criteria without an enabled flag', () => {
    const snapshot = DEFAULT_CRITERIA.map(({ key, weight, min, max, direction }) => ({ key, weight, min, max, direction }));
    expect(calculateScore({ ...all(5), complexity: 1 }, snapshot)).toBe(100);
  });
});

describe('levels and weights', () => {
  it('maps scores to levels using thresholds', () => {
    expect(levelForScore(80, DEFAULT_THRESHOLDS)).toBe('critical');
    expect(levelForScore(79, DEFAULT_THRESHOLDS)).toBe('high');
    expect(levelForScore(40, DEFAULT_THRESHOLDS)).toBe('medium');
    expect(levelForScore(39, DEFAULT_THRESHOLDS)).toBe('low');
    expect(levelForScore(50, { critical: 90, high: 70, medium: 50 })).toBe('medium');
  });

  it('normalizes weights across enabled criteria', () => {
    const weights = normalizedWeights(DEFAULT_CRITERIA.map(c => ({ ...c, weight: 1 })));
    expect(Object.values(weights).every(w => w === 20)).toBe(true);
  });

  it('falls back to the default model for teams without one', () => {
    expect(teamModel(null)).toEqual({ criteria: DEFAULT_CRITERIA, thresholds: DEFAULT_THRESHOLDS });
    expect(teamModel({ assessmentCriteria: [], priorityThresholds: DEFAULT_THRESHOLDS }).criteria).toBe(DEFAULT_CRITERIA);
  });
});

describe('validateModel', () => {
  it('accepts the defaults', () => {
    expect(validateModel(DEFAULT_CRITERIA, DEFAULT_THRESHOLDS)).toEqual([]);
  });

  it('reports unusable models', () => {
    const disabled = DEFAULT_CRITERIA.map(c => ({ ...c, enabled: false }));
    expect(validateModel(disabled, DEFAULT_THRESHOLDS)[0]).toMatch(/at least one/);
    expect(validateModel([{ ...DEFAULT_CRITERIA[0], min: 5, max: 1 }], DEFAULT_THRESHOLDS)[0]).toMatch(/maximum/);
    expect(validateModel(DEFAULT_CRITERIA, { critical: 50, high: 60, medium: 40 })[0]).toMatch(/Thresholds/);
  });
});

describe('criterionKey', () => {
  it('makes unique camelCase keys', () => {
    expect(criterionKey('Customer impact', [])).toBe('customerImpact');
    expect(criterionKey('Customer impact', ['customerImpact'])).toBe('customerImpact2');
    expect(criterionKey('  ', [])).toBe('criterion');
  });
});
