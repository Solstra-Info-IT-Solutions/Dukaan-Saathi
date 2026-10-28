import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { button, input, PageTitle, table, when } from '@/core/ui/ui';
import { rolesFor } from '@/features/navigation/domain/modules';
import { SupportRepository } from '@/features/support/data/SupportRepository';
import { isTicketStatus, TICKET_STATUS_LABEL, TICKET_STATUSES } from '@/features/support/domain/support';

/** Open tickets, most urgent and longest waiting first. */
export default async function SupportQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireOperator(rolesFor('/support'));
  const { q = '', status } = await searchParams;
  const statusFilter = isTicketStatus(status) ? status : null;
  const tickets = await new SupportRepository(await adminClient()).list(statusFilter, q);

  return (
    <>
      <PageTitle title="Support" subtitle="Questions from shops. Open tickets by default." />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Subject or shop"
          aria-label="Search tickets"
          className={input}
        />
        <select name="status" defaultValue={statusFilter ?? ''} aria-label="Status" className={input}>
          <option value="">Open</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TICKET_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="submit" className={button}>
          Search
        </button>
      </form>
      <table className={table}>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Shop</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Assigned</th>
            <th>Last message</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/support/${t.id}`} className="font-medium text-emerald-800 hover:underline">
                  {t.subject}
                </Link>
              </td>
              <td>{t.shopName}</td>
              <td>{t.category}</td>
              <td
                className={
                  t.priority === 'urgent' || t.priority === 'high' ? 'font-medium text-red-700' : undefined
                }
              >
                {t.priority}
              </td>
              <td>{TICKET_STATUS_LABEL[t.status]}</td>
              <td>{t.assignedToEmail ?? '—'}</td>
              <td>{when(t.lastMessageAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tickets.length === 0 ? <p className="mt-4 text-sm text-slate-600">No tickets.</p> : null}
    </>
  );
}
