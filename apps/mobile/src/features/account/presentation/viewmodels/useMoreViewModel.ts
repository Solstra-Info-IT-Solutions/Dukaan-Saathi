import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import { useSessionStore } from '@/core/session/sessionStore';
import { visibleModules } from '@/shared/navigation/modules';

export interface MoreViewModelDeps {
  signOut: { execute(): Promise<void> };
  /** Bills and payments of this user not yet sent (Phase 09); asked before signing out. */
  unsentCount?: (userId: string) => number;
}

/** The More tab: modules this role may open, switch shop, sign out. */
export function useMoreViewModel({ signOut, unsentCount }: MoreViewModelDeps) {
  const shop = useSessionStore((s) => s.activeShop);
  const userId = useSessionStore((s) => s.userId);
  const [unsent, setUnsent] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  /**
   * Unsent work stays on the phone, tagged with this user, and is sent when they sign in again; it is never
   * sent under someone else's account. Signing out with unsent work needs a second tap (ADR-057).
   */
  const doSignOut = useCallback(
    async (confirmed = false) => {
      if (busy.current) return;
      const waiting = userId && unsentCount ? unsentCount(userId) : 0;
      if (waiting > 0 && !confirmed) {
        setUnsent(waiting);
        return;
      }
      setUnsent(null);
      busy.current = true;
      setSigningOut(true);
      setErrorKey(null);
      try {
        await signOut.execute(); // the auth listener moves the app to the login screen
      } catch (error) {
        setErrorKey(translateError(error).messageKey);
      } finally {
        busy.current = false;
        setSigningOut(false);
      }
    },
    [signOut, unsentCount, userId],
  );

  return {
    state: {
      shopName: shop?.shopName ?? '',
      role: shop?.role ?? null,
      modules: visibleModules(shop?.permissions ?? []),
      signingOut,
      errorKey,
      unsent,
    },
    actions: {
      signOut: () => doSignOut(false),
      confirmSignOut: () => doSignOut(true),
      cancelSignOut: () => setUnsent(null),
    },
  };
}
