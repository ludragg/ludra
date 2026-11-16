import data from "@/changelog.json";
import type { Locale } from "@/stores/preferences.svelte";

export type ReleaseNotes = {
  features: string[];
  fixes: string[];
};

export type Release = {
  version: string;
  notes: Record<Locale, ReleaseNotes>;
};

export const releases: Release[] = data;
