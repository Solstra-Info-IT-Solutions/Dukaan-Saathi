import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { ActionError, button, card, dangerButton, input, Notice, PageTitle, when } from '@/core/ui/ui';
import { type Flag, FlagsRepository } from '@/features/flags/data/FlagsRepository';
import { flagSummary } from '@/features/flags/domain/flags';
import { killFlagAction, saveFlagAction } from '@/features/flags/presentation/actions';
import { RevisionList } from '@/features/flags/presentation/RevisionList';
import { rolesFor } from '@/features/navigation/domain/modules';

const reason = (label: string) => (
  <input name="reason" required minLength={5} placeholder="Reason" aria-label={label} className={input} />
);

function FlagForm({ flag }: { flag?: Flag }) {
  return (
    <form action={saveFlagAction} className="grid gap-2 text-sm sm:grid-cols-2">
      {flag ? (
        <input type="hidden" name="key" value={flag.key} />
      ) : (
        <>
          <input type="hidden" name="isNew" value="1" />
          <label className="flex flex-col">
            Key (a–z, 0–9, _)
            <input name="key" required pattern="[a-z][a-z0-9_]{2,40}" className={input} />
          </label>
        </>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" name="enabled" defaultChecked={flag?.enabled} /> On
      </label>
      <label className="flex flex-col">
        Rollout %
        <input
          name="rolloutPercent"
          type="number"
          min={0}
          max={100}
          defaultValue={flag?.rolloutPercent ?? 100}
          className={input}
        />
      </label>
      <label className="flex flex-col">
        Minimum app version (optional)
        <input
          name="minAppVersion"
          placeholder="1.2.0"
          defaultValue={flag?.minAppVersion ?? ''}
          className={input}
        />
      </label>
      <label className="flex flex-col sm:col-span-2">
        Description
        <input name="description" maxLength={300} defaultValue={flag?.description} className={input} />
      </label>
      {reason('Reason for the change')}
      <div>
        <button type="submit" className={button}>
          {flag ? 'Save' : 'Create flag'}
        </button>
      </div>
    </form>
  );
}

/**
 * Feature flags: rollout, minimum app version, per-shop overrides (on the shop page) and the kill switch. A flag that
 * is off is off for every shop, overrides included. Billing itself is never behind a flag.
 */
export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const operator = await requireOperator(rolesFor('/flags'));
  const canEdit = operator.role === 'super_admin';
  const { error, done } = await searchParams;
  const repo = new FlagsRepository(await adminClient());
  const flags = await repo.listFlags();
  const history = canEdit
    ? await Promise.all(flags.map((f) => repo.revisions('feature_flag', f.key)))
    : flags.map(() => []);

  return (
    <>
      <PageTitle
        title="Feature flags"
        subtitle="Phones pick up changes within the refresh interval; server checks apply at once."
      />
      <ActionError code={error} />
      <Notice text={done ? 'Saved.' : null} />
      <div className="flex flex-col gap-4">
        {flags.map((f, i) => (
          <section key={f.key} className={card} aria-labelledby={`flag-${f.key}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`flag-${f.key}`} className="font-mono font-semibold">
                {f.key}
              </h2>
              <span
                className={`rounded px-2 text-xs ${f.enabled ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100'}`}
              >
                {flagSummary(f)}
              </span>
              {!f.killSwitchable ? <span className="text-xs text-slate-500">not kill-switchable</span> : null}
              <span className="text-xs text-slate-500">
                rev {f.revision} · {when(f.updatedAt)}
                {f.updatedBy ? ` · ${f.updatedBy}` : ''}
              </span>
            </div>
            <p className="text-sm text-slate-600">{f.description}</p>
            {f.overrides.length > 0 ? (
              <ul className="mt-1 text-xs">
                {f.overrides.map((o) => (
                  <li key={o.shopId}>
                    <Link href={`/shops/${o.shopId}`} className="text-emerald-800 underline">
                      {o.shopName}
                    </Link>
                    : {o.value ? 'on' : 'off'} — {o.reason}
                    {o.expiresAt ? ` (until ${when(o.expiresAt)})` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            {canEdit && f.enabled && f.killSwitchable ? (
              <form action={killFlagAction} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="key" value={f.key} />
                {reason(`Reason to switch off ${f.key}`)}
                <button type="submit" className={dangerButton}>
                  Kill switch: turn off for everyone
                </button>
              </form>
            ) : null}
            {canEdit ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-emerald-800">Edit</summary>
                <div className="mt-2">
                  <FlagForm flag={f} />
                </div>
              </details>
            ) : null}
            {canEdit ? <RevisionList revisions={history[i] ?? []} back="/flags" canRestore /> : null}
          </section>
        ))}
        {canEdit ? (
          <section className={card}>
            <h2 className="mb-2 font-semibold">New flag</h2>
            <FlagForm />
          </section>
        ) : null}
      </div>
    </>
  );
}
