import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { ActionError, button, card, input, Notice, PageTitle, rupees, table } from '@/core/ui/ui';
import { BillingRepository, type Plan } from '@/features/billing/data/BillingRepository';
import { formatEntitlement } from '@/features/billing/domain/entitlements';
import { savePlanAction, setPlanEntitlementAction } from '@/features/billing/presentation/actions';
import { rolesFor } from '@/features/navigation/domain/modules';

function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <form action={savePlanAction} className="grid gap-2 text-sm sm:grid-cols-2">
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      {plan ? null : (
        <label className="flex flex-col">
          Code (a–z and _)
          <input name="code" required pattern="[a-z_]+" className={input} />
        </label>
      )}
      <label className="flex flex-col">
        Name (English)
        <input name="nameEn" required defaultValue={plan?.name.en} className={input} />
      </label>
      <label className="flex flex-col">
        Name (Hindi)
        <input name="nameHi" defaultValue={plan?.name.hi} className={input} />
      </label>
      <label className="flex flex-col">
        Price (₹)
        <input
          name="price"
          inputMode="decimal"
          defaultValue={plan ? String(plan.pricePaise / 100) : '0'}
          className={input}
        />
      </label>
      <label className="flex flex-col">
        Period
        <select name="billingPeriod" defaultValue={plan?.billingPeriod ?? 'month'} className={input}>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="none">None (free)</option>
        </select>
      </label>
      <label className="flex flex-col">
        Trial days
        <input name="trialDays" inputMode="numeric" defaultValue={plan?.trialDays ?? 0} className={input} />
      </label>
      <label className="flex flex-col">
        Status
        <select name="status" defaultValue={plan?.status ?? 'draft'} className={input}>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="retired">Retired</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="isPublic" defaultChecked={plan?.isPublic} /> Shown to shops
      </label>
      <div>
        <button type="submit" className={button}>
          {plan ? 'Save plan' : 'Create plan'}
        </button>
      </div>
    </form>
  );
}

/**
 * Plans and what each includes. A change to a cell is enforced by the server at once; phones show it after their next
 * refresh. free_tier applies to shops without a paid or trial plan.
 */
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const operator = await requireOperator(rolesFor('/plans'));
  const canEdit = operator.role === 'super_admin' || operator.role === 'billing_admin';
  const { error, done } = await searchParams;
  const { definitions, plans } = await new BillingRepository(await adminClient()).listPlans();

  return (
    <>
      <PageTitle
        title="Plans"
        subtitle="What each plan includes. Placeholder prices until pricing is decided (OD-15)."
      />
      <ActionError code={error} />
      <Notice text={done ? 'Saved.' : null} />
      <div className="overflow-x-auto">
        <table className={table}>
          <thead>
            <tr>
              <th>Entitlement</th>
              {plans.map((p) => (
                <th key={p.id}>
                  {p.name.en} <span className="font-mono text-xs">({p.code})</span>
                  <div className="text-xs font-normal">
                    {rupees(p.pricePaise)} / {p.billingPeriod} · {p.status}
                    {p.isPublic ? ' · public' : ''} · {p.shopCount} shops
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {definitions.map((d) => (
              <tr key={d.key} className="align-top">
                <td>
                  <div className="font-mono text-xs">{d.key}</div>
                  <div className="text-xs text-slate-500">{d.description}</div>
                </td>
                {plans.map((p) => (
                  <td key={p.id}>
                    {canEdit ? (
                      <form action={setPlanEntitlementAction} className="flex gap-1">
                        <input type="hidden" name="planId" value={p.id} />
                        <input type="hidden" name="key" value={d.key} />
                        <input type="hidden" name="valueType" value={d.valueType} />
                        {d.valueType === 'boolean' ? (
                          <select
                            name="value"
                            defaultValue={String(p.entitlements[d.key] ?? d.defaultValue)}
                            aria-label={`${d.key} for ${p.code}`}
                            className={input}
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : (
                          <input
                            name="value"
                            defaultValue={
                              p.entitlements[d.key] === null
                                ? 'unlimited'
                                : String(p.entitlements[d.key] ?? '')
                            }
                            aria-label={`${d.key} for ${p.code}`}
                            className={`${input} w-24`}
                          />
                        )}
                        <button type="submit" className="text-xs text-emerald-800 underline">
                          Set
                        </button>
                      </form>
                    ) : (
                      formatEntitlement(p.entitlements[d.key])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {plans.map((p) => (
            <details key={p.id} className={card}>
              <summary className="cursor-pointer font-semibold">Edit {p.name.en}</summary>
              <div className="mt-2">
                <PlanForm plan={p} />
              </div>
            </details>
          ))}
          <section className={card}>
            <h2 className="mb-2 font-semibold">New plan</h2>
            <PlanForm />
          </section>
        </div>
      ) : null}
    </>
  );
}
