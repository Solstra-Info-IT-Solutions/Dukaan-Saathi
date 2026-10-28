import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { button, input, PageTitle, table, when } from '@/core/ui/ui';
import { ShopsRepository } from '@/features/shops/data/ShopsRepository';
import { rolesFor } from '@/features/navigation/domain/modules';

/** Shops, newest first. Filters live in the URL so a search can be shared and survives Back. */
export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string }>;
}) {
  await requireOperator(rolesFor('/shops'));
  const { q = '', status, cursor } = await searchParams;
  const statusFilter = status === 'active' || status === 'suspended' ? status : null;
  const page = await new ShopsRepository(await adminClient()).list(q, statusFilter, cursor ?? null);
  const next = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  });
  if (page.nextCursor) next.set('cursor', page.nextCursor);

  return (
    <>
      <PageTitle title="Shops" subtitle="Search by name, city or at least 4 digits of the shop phone." />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search" aria-label="Search shops" className={input} />
        <select name="status" defaultValue={statusFilter ?? ''} aria-label="Status" className={input}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button type="submit" className={button}>
          Search
        </button>
      </form>
      <table className={table}>
        <thead>
          <tr>
            <th>Shop</th>
            <th>City</th>
            <th>Phone</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Last bill</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((s) => (
            <tr key={s.shopId}>
              <td>
                <Link href={`/shops/${s.shopId}`} className="font-medium text-emerald-800 hover:underline">
                  {s.name}
                </Link>
              </td>
              <td>{s.city ?? '—'}</td>
              <td>{s.phone ?? '—'}</td>
              <td>
                {s.plan ?? '—'}{' '}
                {s.subscriptionStatus ? (
                  <span className="text-slate-500">({s.subscriptionStatus})</span>
                ) : null}
              </td>
              <td className={s.status === 'suspended' ? 'font-medium text-red-700' : undefined}>
                {s.status}
              </td>
              <td>{when(s.lastSaleAt)}</td>
              <td>{when(s.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.items.length === 0 ? <p className="mt-4 text-sm text-slate-600">No shops found.</p> : null}
      {page.nextCursor ? (
        <Link
          href={`/shops?${next.toString()}`}
          className="mt-4 inline-block text-sm text-emerald-800 underline"
        >
          Next page
        </Link>
      ) : null}
    </>
  );
}
