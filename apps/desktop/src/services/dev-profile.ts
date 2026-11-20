import { invoke, isTauri } from "@tauri-apps/api/core";

export type DevProfile = { name: string; login: string; password: string };

let pending: Promise<DevProfile | null> | null = null;
let signedIn = false;

export function devProfile(): Promise<DevProfile | null> {
  if (!import.meta.env.DEV || !isTauri()) {
    return Promise.resolve(null);
  }
  pending ??= invoke<DevProfile | null>("dev_profile").catch(() => null);
  return pending;
}

export async function takeDevLogin(): Promise<DevProfile | null> {
  const profile = await devProfile();
  if (signedIn || !profile?.login || !profile.password) {
    return null;
  }
  signedIn = true;
  return profile;
}
