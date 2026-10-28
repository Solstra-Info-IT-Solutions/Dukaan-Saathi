export type Severity = 'info' | 'warning' | 'critical';
export type AnnouncementStatus = 'draft' | 'published' | 'archived';

export interface AnnouncementInput {
  title?: { en: string; hi?: string };
  body?: { en?: string; hi?: string };
  severity?: Severity;
  status?: AnnouncementStatus;
  startsAt?: string | null;
  endsAt?: string | null;
}

const SEVERITIES: Severity[] = ['info', 'warning', 'critical'];
const STATUSES: AnnouncementStatus[] = ['draft', 'published', 'archived'];

/** `datetime-local` value (India time) → ISO, or null when empty. */
export function istToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local.length === 16 ? `${local}:00` : local}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → `datetime-local` value in India time. */
export function isoToIst(iso: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

/** Form fields → admin_save_announcement input. Returns null when the English title is missing. */
export function announcementFromForm(get: (name: string) => string): AnnouncementInput | null {
  const titleEn = get('titleEn');
  if (!titleEn) return null;
  const titleHi = get('titleHi');
  const bodyEn = get('bodyEn');
  const bodyHi = get('bodyHi');
  const severity = get('severity') as Severity;
  const status = get('status') as AnnouncementStatus;
  return {
    title: { en: titleEn, ...(titleHi ? { hi: titleHi } : {}) },
    body: { ...(bodyEn ? { en: bodyEn } : {}), ...(bodyHi ? { hi: bodyHi } : {}) },
    severity: SEVERITIES.includes(severity) ? severity : 'info',
    status: STATUSES.includes(status) ? status : 'draft',
    startsAt: istToIso(get('startsAt')),
    endsAt: istToIso(get('endsAt')),
  };
}
