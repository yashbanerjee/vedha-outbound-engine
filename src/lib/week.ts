import { addWeeks, format, parseISO, startOfWeek, isValid } from "date-fns";

/** Monday of the week containing `date`, at UTC midnight (matches the DATE column). */
export function weekStartOf(date: Date): Date {
  const local = startOfWeek(date, { weekStartsOn: 1 });
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

export function currentWeekStart(): Date {
  return weekStartOf(new Date());
}

/** "yyyy-MM-dd" key for a week start. */
export function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseWeekKey(key: string | undefined | null): Date | null {
  if (!key) return null;
  const d = parseISO(key);
  if (!isValid(d)) return null;
  return weekStartOf(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function weekLabel(weekStart: Date): string {
  const start = new Date(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${format(start, "d MMM")} - ${format(end, "d MMM yyyy")}`;
}

/** Options for a week picker: `past` weeks back and `future` weeks ahead of the current one. */
export function weekOptions(past = 2, future = 8): { key: string; label: string; isCurrent: boolean }[] {
  const current = currentWeekStart();
  const out: { key: string; label: string; isCurrent: boolean }[] = [];
  for (let i = -past; i <= future; i++) {
    const d = weekStartOf(addWeeks(new Date(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()), i));
    out.push({ key: weekKey(d), label: weekLabel(d), isCurrent: i === 0 });
  }
  return out;
}
