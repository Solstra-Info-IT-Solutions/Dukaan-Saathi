import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { card, PageTitle, when } from '@/core/ui/ui';
import { rolesFor } from '@/features/navigation/domain/modules';
import { OnboardingRepository } from '@/features/onboarding/data/OnboardingRepository';
import { type OnboardingStatus, STATUS_LABEL } from '@/features/onboarding/domain/onboarding';

const COLUMNS: OnboardingStatus[] = ['new', 'assigned', 'in_progress', 'awaiting_owner'];

/** Onboarding queue by status, oldest first. */
export default async function OnboardingQueuePage() {
  await requireOperator(rolesFor('/onboarding'));
  const requests = await new OnboardingRepository(await adminClient()).list(null);
  return (
    <>
      <PageTitle title="Onboarding" subtitle="Shops that asked us to set up their item list." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((status) => {
          const items = requests.filter((r) => r.status === status);
          return (
            <section
              key={status}
              className="rounded-lg bg-surface-soft p-3"
              aria-labelledby={`col-${status}`}
            >
              <h2 id={`col-${status}`} className="mb-2 text-sm font-semibold">
                {STATUS_LABEL[status]} ({items.length})
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((r) => (
                  <li key={r.id} className={card}>
                    <Link href={`/onboarding/${r.id}`} className="font-medium text-brand hover:underline">
                      {r.shopName}
                    </Link>
                    <p className="text-xs text-ink-2">
                      {r.method} · {r.files.length} files · {when(r.createdAt)}
                    </p>
                    {r.assignedToEmail ? <p className="text-xs text-ink-2">{r.assignedToEmail}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
