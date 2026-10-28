import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { ActionError, button, card, input, Notice, PageTitle, when } from '@/core/ui/ui';
import { FlagsRepository } from '@/features/flags/data/FlagsRepository';
import { setConfigAction } from '@/features/flags/presentation/actions';
import { RevisionList } from '@/features/flags/presentation/RevisionList';
import { rolesFor } from '@/features/navigation/domain/modules';

/** What each key controls (FEATURE_CONFIGURATION.md §6). The database checks the shape of every value. */
const HELP: Record<string, string> = {
  'app.min_supported_version': 'Older apps must update before they can write. "1.2.0"',
  'app.latest_version': 'Newest app version; older apps see "update available". "1.3.0"',
  'config.refresh_seconds': 'How often phones refresh flags and plan (300–86400).',
  maintenance:
    'Banner during maintenance: {"active": true, "message": {"en": "…", "hi": "…"}, "blocksWrites": false}',
  'shops.max_per_user': 'How many shops one person may create (1–50).',
  'import.max_file_mb': 'Largest CSV a shop may import (1–20 MB).',
  'support.contact': 'Shown on the plan screen: {"whatsapp": "+91…", "phone": "+91…", "hours": {"en": "…"}}',
  'subscription.lifecycle': 'Days after the period end: {"pastDueDays": 3, "graceDays": 7}',
};

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  await requireOperator(rolesFor('/config'));
  const { error, done } = await searchParams;
  const repo = new FlagsRepository(await adminClient());
  const entries = await repo.listConfig();
  const history = await Promise.all(entries.map((e) => repo.revisions('platform_config', e.key)));

  return (
    <>
      <PageTitle
        title="Platform config"
        subtitle="Values phones and the server read without an app release. Every change is a revision you can restore."
      />
      <ActionError code={error} />
      <Notice text={done ? 'Saved.' : null} />
      <div className="grid gap-4 lg:grid-cols-2">
        {entries.map((e, i) => (
          <section key={e.key} className={card} aria-labelledby={`cfg-${e.key}`}>
            <h2 id={`cfg-${e.key}`} className="font-mono font-semibold">
              {e.key}
            </h2>
            <p className="text-xs text-slate-600">{HELP[e.key] ?? ''}</p>
            <p className="text-xs text-slate-500">
              rev {e.revision} · {when(e.updatedAt)}
              {e.updatedBy ? ` · ${e.updatedBy}` : ''}
            </p>
            <form action={setConfigAction} className="mt-2 flex flex-col gap-2 text-sm">
              <input type="hidden" name="key" value={e.key} />
              {/* An edit made from an older revision is refused (two operators editing at once). */}
              <input type="hidden" name="revision" value={e.revision} />
              <textarea
                name="value"
                rows={3}
                defaultValue={JSON.stringify(e.value, null, 1)}
                aria-label={`Value of ${e.key}`}
                className={`${input} font-mono`}
              />
              <input
                name="reason"
                required
                minLength={5}
                placeholder="Reason"
                aria-label="Reason"
                className={input}
              />
              <button type="submit" className={button}>
                Save
              </button>
            </form>
            <RevisionList revisions={history[i] ?? []} back="/config" canRestore />
          </section>
        ))}
      </div>
    </>
  );
}
