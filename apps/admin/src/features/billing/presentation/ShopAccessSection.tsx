import { button, card, input, secondaryButton, table, when } from '@/core/ui/ui';
import type { Plan, ShopAccess } from '../data/BillingRepository';
import { formatEntitlement } from '../domain/entitlements';
import { assignPlanAction, endOverrideAction, setFlagOverrideAction, setOverrideAction } from './actions';

const reasonInput = (label: string) => (
  <input name="reason" required minLength={5} placeholder="Reason" aria-label={label} className={input} />
);

/** Shop page section: subscription history, plan assignment, entitlement overrides and flag overrides. */
export function ShopAccessSection({
  shopId,
  access,
  plans,
  canBill,
  canFlag,
}: {
  shopId: string;
  access: ShopAccess;
  plans: Plan[];
  canBill: boolean;
  canFlag: boolean;
}) {
  const keys = Object.keys(access.entitlements).sort();
  const liveOverrides = access.overrides.filter((o) => o.active);
  const typeOf = (key: string) =>
    typeof access.entitlements[key] === 'boolean' ? ('boolean' as const) : ('limit' as const);

  return (
    <>
      <section className={card} aria-labelledby="plan">
        <h2 id="plan" className="mb-2 font-semibold">
          Plan: {access.effectivePlanCode}
        </h2>
        <table className={table}>
          <tbody>
            {access.subscriptions.slice(0, 5).map((s) => (
              <tr key={s.id}>
                <td className={s.isCurrent ? 'font-medium' : 'text-slate-500'}>{s.planCode}</td>
                <td>{s.status}</td>
                <td>{s.provider}</td>
                <td>
                  {s.trialEndsAt ? `trial to ${when(s.trialEndsAt)}` : `to ${when(s.currentPeriodEnd)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canBill ? (
          <form action={assignPlanAction} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="shopId" value={shopId} />
            <label className="flex flex-col">
              Plan
              <select name="planCode" className={input}>
                {plans
                  .filter((p) => p.status !== 'retired')
                  .map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.name.en}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col">
              As
              <select name="status" className={input}>
                <option value="active">Paid (active)</option>
                <option value="trialing">Trial</option>
              </select>
            </label>
            <label className="flex flex-col">
              Until (India time)
              <input type="datetime-local" name="endsAt" className={input} />
            </label>
            {reasonInput('Reason for the plan change')}
            <button type="submit" className={button}>
              Assign plan
            </button>
          </form>
        ) : null}
      </section>

      <section className={card} aria-labelledby="entitlements">
        <h2 id="entitlements" className="mb-2 font-semibold">
          What this shop has
        </h2>
        <table className={table}>
          <tbody>
            {keys.map((k) => {
              const o = liveOverrides.find((x) => x.key === k);
              return (
                <tr key={k}>
                  <td className="font-mono text-xs">{k}</td>
                  <td>{formatEntitlement(access.entitlements[k])}</td>
                  <td className="text-xs">
                    {o ? (
                      <>
                        override: {o.reason}
                        {o.expiresAt ? ` · until ${when(o.expiresAt)}` : ''}
                        {canBill ? (
                          <form action={endOverrideAction} className="mt-1 flex gap-1">
                            <input type="hidden" name="shopId" value={shopId} />
                            <input type="hidden" name="overrideId" value={o.id} />
                            {reasonInput(`Reason to end the ${k} override`)}
                            <button type="submit" className={secondaryButton}>
                              End
                            </button>
                          </form>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {canBill ? (
          <form action={setOverrideAction} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="shopId" value={shopId} />
            <label className="flex flex-col">
              Entitlement
              <select name="key" className={input}>
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              Value (yes / no, a number or unlimited)
              <input name="value" required className={input} />
            </label>
            <OverrideTypeHint keys={keys} typeOf={typeOf} />
            <label className="flex flex-col">
              Until (optional)
              <input type="datetime-local" name="expiresAt" className={input} />
            </label>
            {reasonInput('Reason for the override')}
            <button type="submit" className={button}>
              Set override
            </button>
          </form>
        ) : null}
      </section>

      <section className={card} aria-labelledby="flags">
        <h2 id="flags" className="mb-2 font-semibold">
          Features switched on
        </h2>
        <table className={table}>
          <tbody>
            {access.flags.map((f) => (
              <tr key={f.key} className="align-top">
                <td className="font-mono text-xs">{f.key}</td>
                <td>{f.enabled ? 'On' : 'Off'}</td>
                <td className="text-xs">
                  {f.override
                    ? `override ${f.override.value ? 'on' : 'off'}: ${f.override.reason}`
                    : 'rollout'}
                  {canFlag ? (
                    <form action={setFlagOverrideAction} className="mt-1 flex flex-wrap gap-1">
                      <input type="hidden" name="shopId" value={shopId} />
                      <input type="hidden" name="key" value={f.key} />
                      <select name="value" aria-label={`Override for ${f.key}`} className={input}>
                        <option value="on">On for this shop</option>
                        <option value="off">Off for this shop</option>
                        <option value="clear">Follow the rollout</option>
                      </select>
                      <input type="hidden" name="expiresAt" value="" />
                      {reasonInput(`Reason for the ${f.key} override`)}
                      <button type="submit" className={secondaryButton}>
                        Save
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

/** Each key's value type as `type:<key>`, so the action can parse the value of whichever key was chosen. */
function OverrideTypeHint({ keys, typeOf }: { keys: string[]; typeOf: (k: string) => 'boolean' | 'limit' }) {
  return (
    <>
      {keys.map((k) => (
        <input key={k} type="hidden" name={`type:${k}`} value={typeOf(k)} />
      ))}
    </>
  );
}
