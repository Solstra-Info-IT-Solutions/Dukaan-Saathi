import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { ActionError, button, card, input, Notice, PageTitle, secondaryButton, when } from '@/core/ui/ui';
import { rolesFor } from '@/features/navigation/domain/modules';
import { SupportRepository } from '@/features/support/data/SupportRepository';
import { TICKET_PRIORITIES, TICKET_STATUS_LABEL, TICKET_STATUSES } from '@/features/support/domain/support';
import { replyTicketAction, updateTicketAction } from '@/features/support/presentation/actions';

/** One ticket: the thread (internal notes marked), a reply box and the ticket's status, priority and owner. */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  await requireOperator(rolesFor('/support'));
  const { id } = await params;
  const { error, done } = await searchParams;
  const t = await new SupportRepository(await adminClient()).get(id);

  return (
    <>
      <PageTitle title={t.subject} subtitle={`${t.shopName} · ${t.category} · opened ${when(t.createdAt)}`} />
      <ActionError code={error} />
      <Notice text={done ? 'Saved.' : null} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-3" aria-label="Messages">
          {t.messages.map((m) => (
            <article
              key={m.id}
              className={`rounded-lg border p-3 text-sm ${
                m.isInternal
                  ? 'border-warning/40 bg-warning-bg'
                  : m.authorKind === 'operator'
                    ? 'border-action-light bg-tint'
                    : 'border-line bg-white'
              }`}
            >
              <p className="mb-1 text-xs text-ink-2">
                {m.author ?? (m.authorKind === 'shop' ? 'Shop' : 'Operator')} · {when(m.createdAt)}
                {m.isInternal ? ' · internal note' : ''}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </article>
          ))}
          <form action={replyTicketAction} className={`${card} flex flex-col gap-2`}>
            <input type="hidden" name="id" value={id} />
            <label className="text-sm font-medium" htmlFor="reply-body">
              Reply
            </label>
            <textarea id="reply-body" name="body" rows={4} maxLength={2000} required className={input} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="internal" /> Internal note (the shop does not see it)
            </label>
            <button type="submit" className={button}>
              Send
            </button>
          </form>
        </section>

        <aside className={`${card} h-fit`}>
          <h2 className="mb-2 font-semibold">Ticket</h2>
          <form action={updateTicketAction} className="flex flex-col gap-2 text-sm">
            <input type="hidden" name="id" value={id} />
            <label>
              Status
              <select name="status" defaultValue={t.status} className={`${input} ml-2`}>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={t.priority} className={`${input} ml-2`}>
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={button}>
              Save
            </button>
          </form>
          <p className="mt-3 text-sm">Assigned to: {t.assignedToEmail ?? 'nobody'}</p>
          <form action={updateTicketAction} className="mt-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="assignTo" value={t.assignedToEmail ? 'none' : 'me'} />
            <button type="submit" className={secondaryButton}>
              {t.assignedToEmail ? 'Unassign' : 'Assign to me'}
            </button>
          </form>
          <p className="mt-3 text-sm">
            <Link href={`/shops/${t.shopId}`} className="text-brand underline">
              Open shop
            </Link>
          </p>
        </aside>
      </div>
    </>
  );
}
