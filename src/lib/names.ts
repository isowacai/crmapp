// People's names: profiles store first and last name, plus the full name (displayName) shown everywhere
import { User } from '../types';

export const fullName = (firstName: string, lastName: string) => [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

// First and last name for editing; profiles created before names were split only have displayName
export const nameParts = (user: Pick<User, 'displayName' | 'firstName' | 'lastName'>) => {
  if (user.firstName || user.lastName) return { firstName: user.firstName ?? '', lastName: user.lastName ?? '' };
  const [firstName = '', ...rest] = (user.displayName ?? '').trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
};
