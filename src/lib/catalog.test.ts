import { describe, expect, it } from 'vitest';
import { allLinesOfBusiness, routeRequest } from './catalog';
import { Service } from '../types';

const team = (id: string, linesOfBusiness?: string[]) => ({ id, name: id, linesOfBusiness });
const service = (teamIds: string[]) => ({ id: 's', name: 'Access review', teamIds }) as Service;

describe('routing requests by line of business', () => {
  const hcm = team('HCM Ops', ['HCM']);
  const prod = team('Production Ops', ['Productions', 'Corporate']);
  const teams = [hcm, prod];

  it('sends the request to the delivering team that serves the LOB', () => {
    const s = service(['HCM Ops', 'Production Ops']);
    expect(routeRequest(s, 'HCM', teams)).toBe(hcm);
    expect(routeRequest(s, 'corporate', teams)).toBe(prod);
    expect(routeRequest(s, 'Retail', teams)).toBeUndefined();
  });

  it('falls back to a team with no LOBs, or the only delivering team', () => {
    const anyLob = team('Service Desk');
    expect(routeRequest(service(['HCM Ops', 'Service Desk']), 'Corporate', [...teams, anyLob])).toBe(anyLob);
    expect(routeRequest(service(['HCM Ops']), 'Corporate', teams)).toBe(hcm);
  });

  it('lists every LOB once', () => {
    expect(allLinesOfBusiness([...teams, team('x', ['HCM'])])).toEqual(['Corporate', 'HCM', 'Productions']);
  });
});
