// lib/time-range.ts
// Shared date-range filtering used by both the Dashboard summary and the
// Call Logs table, so picking "Last 7 days" means the same thing everywhere.

export type TimeRange =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "thisMonth"
  | "prevMonth"
  | "all"
  | "custom";

export const RANGE_LABELS: Record<TimeRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  thisMonth: "This month",
  prevMonth: "Previous month",
  all: "All time",
  custom: "Custom range",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function filterByRange<T extends { at: string }>(
  items: T[],
  range: TimeRange,
  customFrom: string,
  customTo: string
): T[] {
  const now = new Date();

  switch (range) {
    case "all":
      return items;
    case "today": {
      const cutoff = startOfDay(now).getTime();
      return items.filter((c) => new Date(c.at).getTime() >= cutoff);
    }
    case "7d":
    case "30d":
    case "90d": {
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
      return items.filter((c) => new Date(c.at).getTime() >= cutoff);
    }
    case "thisMonth": {
      const cutoff = startOfMonth(now).getTime();
      return items.filter((c) => new Date(c.at).getTime() >= cutoff);
    }
    case "prevMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const end = startOfMonth(now).getTime();
      return items.filter((c) => {
        const t = new Date(c.at).getTime();
        return t >= start && t < end;
      });
    }
    case "custom": {
      if (!customFrom && !customTo) return items;
      const start = customFrom ? startOfDay(new Date(customFrom)).getTime() : -Infinity;
      // "to" is inclusive of the whole day, so the upper bound is the start of the next day.
      const end = customTo
        ? startOfDay(new Date(customTo)).getTime() + 24 * 60 * 60 * 1000
        : Infinity;
      return items.filter((c) => {
        const t = new Date(c.at).getTime();
        return t >= start && t < end;
      });
    }
    default:
      return items;
  }
}
