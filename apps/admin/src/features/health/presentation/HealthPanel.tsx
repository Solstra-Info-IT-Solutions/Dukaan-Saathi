import 'server-only';
import { adminClient, rpc } from '@/core/admin/rpc';
import { card, when } from '@/core/ui/ui';
import { healthAlerts, type SystemHealth } from '../domain/health';

/** Dashboard section: scheduled jobs and anything waiting too long (super_admin, support_agent, analyst). */
export async function HealthPanel() {
  const h = await rpc<SystemHealth>(await adminClient(), 'admin_system_health');
  // eslint-disable-next-line react-hooks/purity -- a server component renders once per request
  const alerts = healthAlerts(h, Date.now());
  return (
    <section className={`${card} mt-6`} aria-labelledby="health">
      <h2 id="health" className="mb-2 font-semibold">
        System health
      </h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-emerald-800">All good.</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1 text-sm" role="alert">
          {alerts.map((a) => (
            <li key={a.text} className={a.level === 'error' ? 'text-red-700' : 'text-amber-800'}>
              {a.text}
            </li>
          ))}
        </ul>
      )}
      <ul className="text-xs text-slate-600">
        {h.jobs.map((j) => (
          <li key={j.job}>
            {j.job}: {j.status ?? 'never ran'} · {when(j.lastRunAt)}
          </li>
        ))}
        <li>
          Bills to review: {h.salesNeedsReview} · past due or grace: {h.shopsPastDueOrGrace} · payment events
          (24 h): {h.paymentEvents24h}
        </li>
        <li>Checked {when(h.checkedAt)}</li>
      </ul>
    </section>
  );
}
