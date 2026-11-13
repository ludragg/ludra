const key = "ludra.session";

export function readSessionToken(): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveSessionToken(token: string) {
  try {
    localStorage.setItem(key, token);
  } catch {
    return;
  }
}

export function clearSessionToken() {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}
