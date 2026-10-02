import { describe, expect, it } from 'vitest';
import { fullName, nameParts } from './names';

describe('names', () => {
  it('joins first and last name, ignoring blanks', () => {
    expect(fullName(' Amina ', 'Yusuf')).toBe('Amina Yusuf');
    expect(fullName('Amina', ' ')).toBe('Amina');
  });

  it('uses stored first and last names, or splits the display name of older profiles', () => {
    expect(nameParts({ displayName: 'x', firstName: 'Mary', lastName: 'Van Dyke' })).toEqual({ firstName: 'Mary', lastName: 'Van Dyke' });
    expect(nameParts({ displayName: 'Mary Van Dyke' })).toEqual({ firstName: 'Mary', lastName: 'Van Dyke' });
    expect(nameParts({ displayName: 'isowac' })).toEqual({ firstName: 'isowac', lastName: '' });
  });
});
