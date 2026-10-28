import { PLATFORM_ROLES } from '@ds/contracts';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient, rpc } from '@/core/admin/rpc';
import { card, PageTitle, rupees } from '@/core/ui/ui';

interface Metrics {
  shops: number;
  newShops7d: number;
  activeShops7d: number;
  activeShops30d: number;
  suspendedShops: number;
  trialsEnding7d: number;
  pastDue: number;
  salesPaise7d: number;
  bills7d: number;
  needsReview7d: number;
  openTickets: number;
  ticketsWaitingSupport: number;
  onboarding: Record<string, number>;
}

export default async function DashboardPage() {
  await requireOperator(PLATFORM_ROLES);
  const m = await rpc<Metrics>(await adminClient(), 'admin_dashboard_metrics');
  const backlog = Object.values(m.onboarding).reduce((s, n) => s + n, 0);
  const tiles: [string, string | number][] = [
    ['Shops', m.shops],
    ['New (7 days)', m.newShops7d],
    ['Active (7 / 30 days)', `${m.activeShops7d} / ${m.activeShops30d}`],
    ['Suspended', m.suspendedShops],
    ['Trials ending (7 days)', m.trialsEnding7d],
    ['Past due', m.pastDue],
    ['Sales (7 days)', `${rupees(m.salesPaise7d)} · ${m.bills7d} bills`],
    ['Offline bills to review (7 days)', m.needsReview7d],
    ['Open tickets', `${m.openTickets} (${m.ticketsWaitingSupport} waiting for us)`],
    ['Onboarding backlog', backlog],
  ];
  return (
    <>
      <PageTitle title="Dashboard" subtitle="Across all shops. Figures update on every visit." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className={card}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
