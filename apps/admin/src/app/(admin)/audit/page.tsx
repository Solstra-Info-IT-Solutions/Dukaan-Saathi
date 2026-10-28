import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { button, input, PageTitle, table, when } from '@/core/ui/ui';
import { AuditRepository } from '@/features/audit/data/AuditRepository';
import { rolesFor } from '@/features/navigation/domain/modules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR_KINDS = ['shop_user', 'platform_admin', 'system'];

const short = (v: unknown) => (v == null ? '' : JSON.stringify(v));

/** Who did what, newest first. Filter by shop id, action prefix (e.g. "admin.") and actor kind. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; action?: string; actor?: string; before?: string }>;
}) {
  await requireOperator(rolesFor('/audit'));
  const sp = await searchParams;
  const shopId = sp.shop && UUID.test(sp.shop) ? sp.shop : null;
  const action = sp.action?.trim() ? sp.action.trim().slice(0, 80) : null;
  const actorKind = sp.actor && ACTOR_KINDS.includes(sp.actor) ? sp.actor : null;
  const beforeId = sp.before && /^\d+$/.test(sp.before) ? Number(sp.before) : null;
  const page = await new AuditRepository(await adminClient()).list({ shopId, action, actorKind, beforeId });

  const next = new URLSearchParams({
    ...(shopId ? { shop: shopId } : {}),
    ...(action ? { action } : {}),
    ...(actorKind ? { actor: actorKind } : {}),
  });
  if (page.nextBeforeId) next.set('before', String(page.nextBeforeId));

  return (
    <>
      <PageTitle title="Audit log" subtitle="Every change to money, stock, members and admin actions." />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input
          name="shop"
          defaultValue={shopId ?? ''}
          placeholder="Shop id"
          aria-label="Shop id"
          className={input}
        />
        <input
          name="action"
          defaultValue={action ?? ''}
          placeholder="Action starts with"
          aria-label="Action"
          className={input}
        />
        <select name="actor" defaultValue={actorKind ?? ''} aria-label="Actor kind" className={input}>
          <option value="">Anyone</option>
          {ACTOR_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button type="submit" className={button}>
          Filter
        </button>
      </form>
      <table className={table}>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Shop</th>
            <th>Action</th>
            <th>What</th>
            <th>Change</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="whitespace-nowrap">{when(e.occurredAt)}</td>
              <td>
                {e.actor ?? '—'} <span className="text-slate-500">({e.actorKind})</span>
              </td>
              <td>
                {e.shopId ? (
                  <Link href={`/shops/${e.shopId}`} className="text-emerald-800 hover:underline">
                    {e.shopName ?? e.shopId}
                  </Link>
                ) : (
                  '—'
                )}
              </td>
              <td className="font-mono text-xs">{e.action}</td>
              <td className="text-xs">
                {e.entityType ?? ''} {e.entityId ?? ''}
              </td>
              <td className="max-w-md break-all font-mono text-xs">
                {e.before != null ? <div className="text-slate-500">{short(e.before)}</div> : null}
                <div>{short(e.after)}</div>
              </td>
              <td>{e.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.items.length === 0 ? <p className="mt-4 text-sm text-slate-600">No events.</p> : null}
      {page.nextBeforeId ? (
        <Link
          href={`/audit?${next.toString()}`}
          className="mt-4 inline-block text-sm text-emerald-800 underline"
        >
          Older
        </Link>
      ) : null}
    </>
  );
}
