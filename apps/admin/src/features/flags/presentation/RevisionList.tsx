import { input, secondaryButton, when } from '@/core/ui/ui';
import type { Revision } from '../data/FlagsRepository';
import { restoreRevisionAction } from './actions';

/** Earlier values with "restore" (which writes a new revision). The newest is the current value. */
export function RevisionList({
  revisions,
  back,
  canRestore,
}: {
  revisions: Revision[];
  back: '/flags' | '/config';
  canRestore: boolean;
}) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-brand">History ({revisions.length})</summary>
      <ul className="mt-2 flex flex-col gap-2">
        {revisions.map((r, i) => (
          <li key={r.id} className="rounded border border-line p-2">
            <p className="text-xs text-ink-2">
              Revision {r.revision} · {when(r.changedAt)} · {r.changedBy ?? 'migration'}
              {i === 0 ? ' · current' : ''}
            </p>
            <pre className="overflow-x-auto text-xs">{JSON.stringify(r.value)}</pre>
            {canRestore && i > 0 ? (
              <form action={restoreRevisionAction} className="mt-1 flex gap-1">
                <input type="hidden" name="revisionId" value={r.id} />
                <input type="hidden" name="back" value={back} />
                <input
                  name="reason"
                  required
                  minLength={5}
                  placeholder="Reason"
                  aria-label={`Reason to restore revision ${r.revision}`}
                  className={input}
                />
                <button type="submit" className={secondaryButton}>
                  Restore
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
