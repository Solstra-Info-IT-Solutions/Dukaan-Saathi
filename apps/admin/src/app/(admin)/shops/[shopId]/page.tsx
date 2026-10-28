import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import {
  ActionError,
  card,
  dangerButton,
  input,
  Notice,
  PageTitle,
  secondaryButton,
  table,
  when,
} from '@/core/ui/ui';
import { rolesFor } from '@/features/navigation/domain/modules';
import { BillingRepository } from '@/features/billing/data/BillingRepository';
import { ShopAccessSection } from '@/features/billing/presentation/ShopAccessSection';
import { ShopsRepository } from '@/features/shops/data/ShopsRepository';
import {
  deactivateMemberAction,
  revokeDeviceAction,
  setShopStatusAction,
} from '@/features/shops/presentation/actions';

/** One shop for support and onboarding. Opening it is audited (admin.shop_viewed); phone numbers are masked. */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const operator = await requireOperator(rolesFor('/shops'));
  const { shopId } = await params;
  const { error, done } = await searchParams;
  const client = await adminClient();
  const billing = new BillingRepository(client);
  const canBill = operator.role === 'super_admin' || operator.role === 'billing_admin';
  const seesAccess = operator.role !== 'onboarding_operator';
  const [d, access, plans] = await Promise.all([
    new ShopsRepository(client).get(shopId),
    seesAccess ? billing.shopAccess(shopId) : Promise.resolve(null),
    canBill ? billing.listPlans().then((r) => r.plans) : Promise.resolve([]),
  ]);
  const canSuspend = operator.role === 'super_admin' || operator.role === 'billing_admin';
  const canSupport = operator.role === 'super_admin' || operator.role === 'support_agent';
  const suspended = d.shop.status === 'suspended';

  return (
    <>
      <PageTitle
        title={d.shop.name}
        subtitle={`${d.shop.businessCategory} · ${d.shop.city ?? 'no city'} · ${d.shop.phone ?? 'no phone'} · since ${when(d.shop.createdAt)}`}
      />
      <ActionError code={error} />
      <Notice text={done ? 'Saved.' : null} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="status">
          <h2 id="status" className="mb-2 font-semibold">
            Status: <span className={suspended ? 'text-red-700' : undefined}>{d.shop.status}</span>
          </h2>
          <p className="text-sm">
            Plan: {d.subscription ? `${d.subscription.plan} (${d.subscription.status})` : '—'}
            {d.subscription?.trialEndsAt ? ` · trial ends ${when(d.subscription.trialEndsAt)}` : ''}
          </p>
          <p className="text-sm">
            {d.usage.products} items · {d.usage.customers} customers · {d.usage.bills30d} bills in 30 days ·{' '}
            {d.usage.needsReview30d} to review · last bill {when(d.usage.lastSaleAt)}
          </p>
          {canSuspend && d.shop.status !== 'closed' ? (
            <form action={setShopStatusAction} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="shopId" value={shopId} />
              <input type="hidden" name="status" value={suspended ? 'active' : 'suspended'} />
              <input
                name="reason"
                required
                minLength={5}
                placeholder="Reason (required)"
                aria-label="Reason"
                className={input}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" value="yes" required />
                {suspended ? 'Reactivate this shop' : 'I understand the shop cannot be used while suspended'}
              </label>
              <button type="submit" className={suspended ? secondaryButton : dangerButton}>
                {suspended ? 'Reactivate shop' : 'Suspend shop'}
              </button>
            </form>
          ) : null}
        </section>

        <section className={card} aria-labelledby="members">
          <h2 id="members" className="mb-2 font-semibold">
            Members
          </h2>
          <table className={table}>
            <tbody>
              {d.members.map((m) => (
                <tr key={m.userId}>
                  <td>{m.name ?? '—'}</td>
                  <td>{m.phone ?? '—'}</td>
                  <td>{m.role}</td>
                  <td>{m.status}</td>
                  <td>
                    {canSupport && m.role !== 'owner' && m.status === 'active' ? (
                      <form action={deactivateMemberAction} className="flex gap-1">
                        <input type="hidden" name="shopId" value={shopId} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <input
                          name="reason"
                          required
                          minLength={5}
                          placeholder="Reason"
                          aria-label={`Reason to deactivate ${m.name ?? m.role}`}
                          className={input}
                        />
                        <button type="submit" className={secondaryButton}>
                          Deactivate
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={card} aria-labelledby="devices">
          <h2 id="devices" className="mb-2 font-semibold">
            Phones
          </h2>
          <table className={table}>
            <tbody>
              {d.devices.map((v) => (
                <tr key={v.deviceId}>
                  <td>{v.code}</td>
                  <td>
                    {v.platform} {v.appVersion ?? ''}
                  </td>
                  <td>{v.status}</td>
                  <td>{when(v.lastSeenAt)}</td>
                  <td>
                    {canSupport && v.status === 'active' ? (
                      <form action={revokeDeviceAction} className="flex gap-1">
                        <input type="hidden" name="shopId" value={shopId} />
                        <input type="hidden" name="deviceId" value={v.deviceId} />
                        <input
                          name="reason"
                          required
                          minLength={5}
                          placeholder="Reason"
                          aria-label={`Reason to revoke phone ${v.code}`}
                          className={input}
                        />
                        <button type="submit" className={secondaryButton}>
                          Revoke
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={card} aria-labelledby="requests">
          <h2 id="requests" className="mb-2 font-semibold">
            Onboarding and tickets
          </h2>
          <ul className="text-sm">
            {d.onboarding.map((r) => (
              <li key={r.id}>
                <Link href={`/onboarding/${r.id}`} className="text-emerald-800 underline">
                  Onboarding ({r.method})
                </Link>{' '}
                · {r.status} · {when(r.createdAt)}
              </li>
            ))}
            {d.tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="text-emerald-800 underline">
                  {t.subject}
                </Link>{' '}
                · {t.status} · {when(t.lastMessageAt)}
              </li>
            ))}
            {d.onboarding.length + d.tickets.length === 0 ? <li className="text-slate-600">None.</li> : null}
          </ul>
        </section>

        {access ? (
          <ShopAccessSection
            shopId={shopId}
            access={access}
            plans={plans}
            canBill={canBill}
            canFlag={operator.role === 'super_admin'}
          />
        ) : null}
      </div>
    </>
  );
}
