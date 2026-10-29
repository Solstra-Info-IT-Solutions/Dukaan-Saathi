import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { ActionError, button, card, input, Notice, PageTitle, secondaryButton, when } from '@/core/ui/ui';
import { rolesFor } from '@/features/navigation/domain/modules';
import { OnboardingRepository } from '@/features/onboarding/data/OnboardingRepository';
import { NEXT_STEPS, STATUS_LABEL, STEP_LABEL } from '@/features/onboarding/domain/onboarding';
import {
  changeOnboardingStatusAction,
  uploadImportCsvAction,
} from '@/features/onboarding/presentation/actions';

/**
 * One request: what the shop sent (files through 5-minute signed links), the import being prepared, and the next
 * steps. The owner approves the import in the app; that completes the request.
 */
export default async function OnboardingRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  await requireOperator(rolesFor('/onboarding'));
  const { id } = await params;
  const { error, done } = await searchParams;
  const repo = new OnboardingRepository(await adminClient());
  const r = await repo.get(id);
  const links = await repo.signedUrls(r.files);
  const canStage = r.status === 'assigned' || r.status === 'in_progress';

  return (
    <>
      <PageTitle
        title={r.shopName}
        subtitle={`Onboarding by ${r.method} · ${STATUS_LABEL[r.status]} · asked ${when(r.createdAt)}`}
      />
      <ActionError code={error} />
      <Notice text={done ? 'Saved.' : null} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-2 font-semibold">Request</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-1 text-sm">
            <dt className="text-ink-2">Call on</dt>
            <dd>{r.contactPhone ?? '—'}</dd>
            <dt className="text-ink-2">Best time</dt>
            <dd>{r.preferredTime ?? '—'}</dd>
            <dt className="text-ink-2">Note</dt>
            <dd>{r.note ?? '—'}</dd>
            <dt className="text-ink-2">Assigned to</dt>
            <dd>{r.assignedToEmail ?? '—'}</dd>
            <dt className="text-ink-2">Status note</dt>
            <dd>{r.statusNote ?? '—'}</dd>
          </dl>
          <p className="mt-2 text-sm">
            <Link href={`/shops/${r.shopId}`} className="text-brand underline">
              Open shop
            </Link>
          </p>
        </section>

        <section className={card}>
          <h2 className="mb-2 font-semibold">Files ({r.files.length})</h2>
          <ul className="text-sm">
            {r.files.map((f) => (
              <li key={f.id}>
                {links[f.path] ? (
                  <a href={links[f.path]} target="_blank" rel="noreferrer" className="text-brand underline">
                    {f.fileName}
                  </a>
                ) : (
                  f.fileName
                )}{' '}
                <span className="text-ink-2">({Math.round(f.sizeBytes / 1024)} KB)</span>
              </li>
            ))}
            {r.files.length === 0 ? <li className="text-ink-2">No files.</li> : null}
          </ul>
        </section>

        <section className={card}>
          <h2 className="mb-2 font-semibold">Item list for the shop</h2>
          {r.importJob ? (
            <p className="mb-2 text-sm">
              {r.importJob.rowCount} rows · {r.importJob.validCount} ready · {r.importJob.errorCount} with
              problems · {r.importJob.createCount} new, {r.importJob.updateCount} updates ·{' '}
              {r.importJob.status}
            </p>
          ) : (
            <p className="mb-2 text-sm text-ink-2">Nothing prepared yet.</p>
          )}
          {canStage ? (
            <form action={uploadImportCsvAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="opId" value={randomUUID()} />
              <label className="text-sm">
                CSV with columns name, price (and optionally unit, category, nameHi, mrp, taxRate, hsn,
                barcode)
                <input
                  type="file"
                  name="csv"
                  accept=".csv,text/csv"
                  required
                  className="mt-1 block text-sm"
                />
              </label>
              <button type="submit" className={button}>
                Upload rows
              </button>
            </form>
          ) : null}
        </section>

        <section className={card}>
          <h2 className="mb-2 font-semibold">Next step</h2>
          {NEXT_STEPS[r.status].length === 0 ? <p className="text-sm text-ink-2">Nothing to do.</p> : null}
          <div className="flex flex-col gap-2">
            {NEXT_STEPS[r.status].map((to) => (
              <form key={to} action={changeOnboardingStatusAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="from" value={r.status} />
                <input type="hidden" name="status" value={to} />
                {to === 'awaiting_owner' ? (
                  <input
                    name="statusNote"
                    placeholder="Message for the owner (optional)"
                    aria-label="Message for the owner"
                    className={input}
                  />
                ) : null}
                <button type="submit" className={to === 'cancelled' ? secondaryButton : button}>
                  {STEP_LABEL[to]}
                </button>
              </form>
            ))}
          </div>
          {r.status === 'awaiting_owner' ? (
            <p className="mt-2 text-sm text-ink-2">
              The owner sees the items under Items → Import in the app and approves them there.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
