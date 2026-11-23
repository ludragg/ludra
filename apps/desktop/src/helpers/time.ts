import { timestampDate, type Timestamp } from "@bufbuild/protobuf/wkt";
import { localeTag, t } from "@/i18n";

export function toDate(timestamp: Timestamp | undefined): Date {
  return timestamp ? timestampDate(timestamp) : new Date(0);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
}

export function formatRecent(date: Date): string {
  switch (daysAgo(date)) {
    case 0:
      return formatTime(date);
    case 1:
      return t("time.yesterday");
    default:
      return date.toLocaleDateString(localeTag(), { day: "2-digit", month: "2-digit" });
  }
}

export function formatDay(date: Date): string {
  switch (daysAgo(date)) {
    case 0:
      return t("time.today");
    case 1:
      return t("time.yesterday");
    default:
      return date.toLocaleDateString(localeTag(), { day: "numeric", month: "long" });
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

export function clock(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
