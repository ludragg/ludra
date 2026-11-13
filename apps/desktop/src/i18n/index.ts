import { preferences, type Locale } from "@/stores/preferences.svelte";
import { en } from "./en";
import { pt, type Messages } from "./pt";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type Key = Leaves<Messages>;

const dictionaries: Record<Locale, Messages> = { pt, en };

export const locales: { id: Locale; label: string; tag: string }[] = [
  { id: "pt", label: "Português (Brasil)", tag: "pt-BR" },
  { id: "en", label: "English", tag: "en-US" },
];

export function t(key: Key, params: Record<string, string | number> = {}): string {
  let value: unknown = dictionaries[preferences.values.language] ?? pt;
  for (const part of key.split(".")) {
    value = (value as Record<string, unknown>)[part];
  }

  return String(value).replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function localeTag(): string {
  return locales.find(({ id }) => id === preferences.values.language)?.tag ?? "pt-BR";
}
