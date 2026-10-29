import { PLATFORM_ROLES } from '@ds/contracts';
import { requireOperator } from '@/core/auth/requireOperator';
import { adminClient } from '@/core/admin/rpc';
import { ActionError, button, card, input, Notice, PageTitle, table, tableWrap, when } from '@/core/ui/ui';
import { rolesFor } from '@/features/navigation/domain/modules';
import { OperatorsRepository } from '@/features/operators/data/OperatorsRepository';
import { inviteOperatorAction, setOperatorAction } from '@/features/operators/presentation/actions';

/** Who can use this panel. Every change needs a reason and is audited; nobody can change their own access. */
export default async function OperatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const me = await requireOperator(rolesFor('/operators'));
  const { error, done } = await searchParams;
  const operators = await new OperatorsRepository(await adminClient()).list();

  return (
    <>
      <PageTitle
        title="Operators"
        subtitle="Platform staff and their roles. Every operator must set up two-step verification."
      />
      <ActionError code={error} />
      <Notice text={done ? 'Saved.' : null} />

      <section className={`${card} mb-6`}>
        <h2 className="mb-2 font-semibold">Invite an operator</h2>
        <form action={inviteOperatorAction} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col">
            Email
            <input type="email" name="email" required maxLength={200} className={input} />
          </label>
          <label className="flex flex-col">
            Role
            <select name="role" defaultValue="support_agent" className={input}>
              {PLATFORM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={button}>
            Send invite
          </button>
        </form>
      </section>

      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>2-step</th>
              <th>Since</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((o) => (
              <tr key={o.userId} className="align-top">
                <td>{o.email ?? o.userId}</td>
                <td>{o.role}</td>
                <td className={o.status === 'disabled' ? 'text-error' : undefined}>{o.status}</td>
                <td>{o.mfaEnrolled ? 'Yes' : <span className="text-warning">Not set up</span>}</td>
                <td>{when(o.createdAt)}</td>
                <td>
                  {o.userId === me.userId ? (
                    <span className="text-xs text-ink-2">You</span>
                  ) : (
                    <form action={setOperatorAction} className="flex flex-wrap gap-1">
                      <input type="hidden" name="userId" value={o.userId} />
                      <select name="role" defaultValue={o.role} aria-label="Role" className={input}>
                        {PLATFORM_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <select name="status" defaultValue={o.status} aria-label="Status" className={input}>
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
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
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
