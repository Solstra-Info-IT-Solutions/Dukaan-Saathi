import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { translateError } from '@/core/errors/translateError';
import { logger } from '@/core/logging/logger';
import { sessionActions } from '@/core/session/sessionStore';
import type { AuthSession } from '@/features/authentication';
import type { AppFeatures } from './container';

/**
 * Keeps the session store in step with Supabase Auth (documented exception: CLEAN_ARCHITECTURE.md §5).
 * On sign-in (or app start with a saved session) it restores memberships and reopens the obvious shop.
 * Token refreshes for the same user do not re-run the restore.
 */
export function SessionController({
  features,
  children,
}: {
  features: AppFeatures | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!features) {
      sessionActions.signedOut();
      return;
    }
    let cancelled = false;
    let currentUserId: string | null = null;

    const handle = async (session: AuthSession | null) => {
      if (cancelled) return;
      if (!session) {
        currentUserId = null;
        queryClient.clear();
        sessionActions.signedOut();
        return;
      }
      if (session.userId === currentUserId) return;
      currentUserId = session.userId;
      try {
        const restored = await features.shops.restoreSession.execute();
        if (!cancelled && currentUserId === session.userId)
          sessionActions.signedIn(session.userId, restored.activation);
      } catch (error) {
        const appError = translateError(error);
        logger.warn('session restore failed', { code: appError.code });
        if (!cancelled && currentUserId === session.userId)
          sessionActions.signedIn(session.userId, null, appError.messageKey);
      }
    };

    features.auth.repository.getSession().then(handle, () => handle(null));
    const unsubscribe = features.auth.repository.onSessionChange((s) => void handle(s));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [features, queryClient]);

  return <>{children}</>;
}
