/** Form values for a flag edit (the database validates again). */
export type FlagEdit =
  | {
      ok: true;
      value: { enabled: boolean; rolloutPercent: number; minAppVersion: string; description: string };
    }
  | { ok: false };

export const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export function flagFromForm(get: (name: string) => string, checked: (name: string) => boolean): FlagEdit {
  const rollout = Number(get('rolloutPercent'));
  const minAppVersion = get('minAppVersion');
  if (!Number.isInteger(rollout) || rollout < 0 || rollout > 100) return { ok: false };
  if (minAppVersion && !SEMVER.test(minAppVersion)) return { ok: false };
  return {
    ok: true,
    value: {
      enabled: checked('enabled'),
      rolloutPercent: rollout,
      minAppVersion,
      description: get('description'),
    },
  };
}

/** Who gets a flag, in words for the list. */
export function flagSummary(f: { enabled: boolean; rolloutPercent: number; minAppVersion: string | null }) {
  if (!f.enabled) return 'Off for everyone';
  const who = f.rolloutPercent >= 100 ? 'All shops' : `${f.rolloutPercent}% of shops`;
  return f.minAppVersion ? `${who} on app ${f.minAppVersion} or newer` : who;
}
