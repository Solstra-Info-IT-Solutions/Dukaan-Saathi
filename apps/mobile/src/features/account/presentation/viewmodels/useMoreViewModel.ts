import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import { useSessionStore } from '@/core/session/sessionStore';
import { visibleModules } from '@/shared/navigation/modules';

export interface MoreViewModelDeps {
  signOut: { execute(): Promise<void> };
}

/** The More tab: modules this role may open, switch shop, sign out. */
export function useMoreViewModel({ signOut }: MoreViewModelDeps) {
  const shop = useSessionStore((s) => s.activeShop);
  const [signingOut, setSigningOut] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const doSignOut = useCallback(async () => {
    if (busy.current) return;
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
  }, [signOut]);

  return {
    state: {
      shopName: shop?.shopName ?? '',
      role: shop?.role ?? null,
      modules: visibleModules(shop?.permissions ?? []),
      signingOut,
      errorKey,
    },
    actions: { signOut: doSignOut },
  };
}
