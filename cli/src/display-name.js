// The public name of a contribution: the contributor's name, then the organization in brackets.

export const MAX_NAME_BYTES = 64;

export const nameBytes = (name) => Buffer.byteLength(name, 'utf8');

// An empty organization gives the name alone.
export function displayName(name, organization = '') {
  const person = name.trim();
  const org = organization.trim();
  return org ? `${person} (${org})` : person;
}
