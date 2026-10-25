import type {
  CloseDayInput,
  DashboardSnapshotDto,
  DayCloseDto,
  ReportGroup,
  SalesReportDto,
} from '@ds/contracts';

// Contract shapes are already what the domain needs (validated by Zod in the data layer).
export type DashboardSnapshot = DashboardSnapshotDto;
export type SalesReport = SalesReportDto;
export type DayClose = DayCloseDto;
export type CloseDayCommand = CloseDayInput;
export type { ReportGroup };

export type RangePreset = 'today' | 'week' | 'month';

export interface DateRange {
  from: string;
  to: string;
}

/** Writes a text file and opens the share sheet (core/sharing implements it). */
export interface FileSharer {
  shareText(fileName: string, mimeType: string, content: string): Promise<void>;
}

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000; // India has no daylight saving

/** The shop's business date (IST) of an instant: "2026-10-25". */
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today / last 7 days / this month, inclusive, as IST dates. */
export function rangeFor(preset: RangePreset, now: Date): DateRange {
  const to = istDate(now);
  if (preset === 'today') return { from: to, to };
  if (preset === 'week') return { from: istDate(new Date(now.getTime() - 6 * DAY_MS)), to };
  return { from: `${to.slice(0, 8)}01`, to };
}

/** Days in an inclusive range. */
export function rangeDays(range: DateRange): number {
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1;
}
