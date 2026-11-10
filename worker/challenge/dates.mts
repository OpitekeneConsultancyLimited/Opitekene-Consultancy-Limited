// Calendar-date helpers (UTC, no time of day). Pure.
import type { IsoDate } from "./types.mts";

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function isWeekend(date: IsoDate): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function todayIso(now: Date = new Date()): IsoDate {
  // Uganda is UTC+3 all year; a deadline "today" follows Kampala's calendar.
  return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export function formatUgx(amount: number): string {
  return `UGX ${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatDate(date: IsoDate): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${months[(month ?? 1) - 1]} ${year}`;
}
