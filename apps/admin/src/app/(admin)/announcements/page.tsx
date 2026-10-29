import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { ActionError, button, card, input, Notice, PageTitle, secondaryButton, when } from '@/core/ui/ui';
import {
  AnnouncementsRepository,
  type Announcement,
} from '@/features/announcements/data/AnnouncementsRepository';
import { isoToIst } from '@/features/announcements/domain/announcement';
import {
  saveAnnouncementAction,
  setAnnouncementStatusAction,
} from '@/features/announcements/presentation/actions';
import { rolesFor } from '@/features/navigation/domain/modules';

function AnnouncementForm({ a }: { a?: Announcement }) {
  return (
    <form action={saveAnnouncementAction} className="grid gap-2 text-sm md:grid-cols-2">
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <label className="flex flex-col">
        Title (English)
        <input name="titleEn" required maxLength={120} defaultValue={a?.title.en} className={input} />
      </label>
      <label className="flex flex-col">
        Title (Hindi)
        <input name="titleHi" maxLength={120} defaultValue={a?.title.hi} className={input} />
      </label>
      <label className="flex flex-col">
        Message (English)
        <textarea name="bodyEn" rows={3} maxLength={1000} defaultValue={a?.body.en} className={input} />
      </label>
      <label className="flex flex-col">
        Message (Hindi)
        <textarea name="bodyHi" rows={3} maxLength={1000} defaultValue={a?.body.hi} className={input} />
      </label>
      <label className="flex flex-col">
        Severity
        <select name="severity" defaultValue={a?.severity ?? 'info'} className={input}>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical (super admin to publish)</option>
        </select>
      </label>
      <label className="flex flex-col">
        Status
        <select name="status" defaultValue={a?.status ?? 'draft'} className={input}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
      <label className="flex flex-col">
        Show from (India time, optional)
        <input
          type="datetime-local"
          name="startsAt"
          defaultValue={isoToIst(a?.startsAt ?? null)}
          className={input}
        />
      </label>
      <label className="flex flex-col">
        Show until (optional)
        <input
          type="datetime-local"
          name="endsAt"
          defaultValue={isoToIst(a?.endsAt ?? null)}
          className={input}
        />
      </label>
      <div>
        <button type="submit" className={button}>
          {a ? 'Save changes' : 'Create'}
        </button>
      </div>
    </form>
  );
}

function StatusButton({ a, to, label }: { a: Announcement; to: Announcement['status']; label: string }) {
  return (
    <form action={setAnnouncementStatusAction}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="status" value={to} />
      <input type="hidden" name="severity" value={a.severity} />
      <button type="submit" className={to === 'published' ? button : secondaryButton}>
        {label}
      </button>
    </form>
  );
}

/** Messages shown in the app's banner. Archived ones are hidden here. */
export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  await requireOperator(rolesFor('/announcements'));
  const { error, done } = await searchParams;
  const items = await new AnnouncementsRepository(await adminClient()).list();

  return (
    <>
      <PageTitle
        title="Announcements"
        subtitle="Shown as a banner in the app while published and in its time window."
      />
      <ActionError code={error} />
      <Notice text={done ? 'Saved.' : null} />
      <section className={`${card} mb-6`}>
        <h2 className="mb-2 font-semibold">New announcement</h2>
        <AnnouncementForm />
      </section>
      <div className="flex flex-col gap-4">
        {items.map((a) => (
          <section key={a.id} className={card}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{a.title.en}</h2>
              <span className="rounded bg-surface-soft px-2 text-xs">{a.status}</span>
              <span
                className={`rounded px-2 text-xs ${a.severity === 'critical' ? 'bg-error-bg text-error' : 'bg-surface-soft'}`}
              >
                {a.severity}
              </span>
              <span className="text-xs text-ink-2">updated {when(a.updatedAt)}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {a.status === 'draft' ? <StatusButton a={a} to="published" label="Publish" /> : null}
              {a.status === 'published' ? <StatusButton a={a} to="draft" label="Unpublish" /> : null}
              <StatusButton a={a} to="archived" label="Archive" />
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-brand">Edit</summary>
              <div className="mt-2">
                <AnnouncementForm a={a} />
              </div>
            </details>
          </section>
        ))}
        {items.length === 0 ? <p className="text-sm text-ink-2">No announcements yet.</p> : null}
      </div>
    </>
  );
}
