import { describe, expect, it } from 'vitest';
import { announcementFromForm, isoToIst, istToIso } from '../domain/announcement';

const form = (values: Record<string, string>) => (name: string) => values[name] ?? '';

describe('announcement form', () => {
  it('needs an English title', () => {
    expect(announcementFromForm(form({ titleHi: 'सूचना' }))).toBeNull();
  });
  it('builds the save input with defaults and India time', () => {
    expect(
      announcementFromForm(
        form({
          titleEn: 'Maintenance',
          bodyHi: 'रात 11 बजे',
          severity: 'warning',
          startsAt: '2026-11-01T23:00',
        }),
      ),
    ).toEqual({
      title: { en: 'Maintenance' },
      body: { hi: 'रात 11 बजे' },
      severity: 'warning',
      status: 'draft',
      startsAt: '2026-11-01T17:30:00.000Z',
      endsAt: null,
    });
  });
  it('falls back to safe values for unknown severity and status', () => {
    const a = announcementFromForm(form({ titleEn: 'x', severity: 'loud', status: 'live' }));
    expect(a?.severity).toBe('info');
    expect(a?.status).toBe('draft');
  });
  it('round-trips India time', () => {
    expect(isoToIst(istToIso('2026-11-01T09:15'))).toBe('2026-11-01T09:15');
    expect(isoToIst(null)).toBe('');
  });
});
