import { timestampDate, type Timestamp } from "@bufbuild/protobuf/wkt";

const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const longDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });

export function toDate(timestamp: Timestamp | undefined): Date {
  return timestamp ? timestampDate(timestamp) : new Date(0);
}

export function formatTime(date: Date): string {
  return clock.format(date);
}

export function formatRecent(date: Date): string {
  switch (daysAgo(date)) {
    case 0:
      return clock.format(date);
    case 1:
      return "Ontem";
    default:
      return shortDate.format(date);
  }
}

export function formatDay(date: Date): string {
  switch (daysAgo(date)) {
    case 0:
      return "Hoje";
    case 1:
      return "Ontem";
    default:
      return longDate.format(date);
  }
}

export function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function daysAgo(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - day.getTime()) / 86_400_000);
}
