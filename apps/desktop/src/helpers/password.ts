export type Strength = 0 | 1 | 2 | 3 | 4;

export function validPassword(password: string): boolean {
  const length = [...password].length;
  return length >= 8 && length <= 128 && /\p{L}/u.test(password) && /\p{Nd}/u.test(password);
}

export function passwordStrength(password: string): Strength {
  if (!password) {
    return 0;
  }
  if (!validPassword(password)) {
    return 1;
  }

  const extras = [
    [...password].length >= 12,
    /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password),
    /[^\p{L}\p{N}\s]/u.test(password),
  ].filter(Boolean).length;

  return extras === 0 ? 2 : extras === 1 ? 3 : 4;
}
