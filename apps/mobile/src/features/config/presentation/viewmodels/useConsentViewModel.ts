import type { ConsentDto } from '@ds/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import { needsConsent } from '../../domain/consent';

export interface ConsentViewModelDeps {
  getMyConsent: () => Promise<ConsentDto>;
  acceptTerms: (version: string) => Promise<ConsentDto>;
  openUrl: (url: string) => Promise<void>;
}

export const consentKey = ['consent'] as const;

/** The user's acceptance of the current privacy policy and terms; accept once per published version. */
export function useConsentViewModel(deps: ConsentViewModelDeps) {
  const queryClient = useQueryClient();
  const consent = useQuery({ queryKey: consentKey, queryFn: deps.getMyConsent });
  const [accepting, setAccepting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const accept = useCallback(async () => {
    const version = consent.data?.currentVersion;
    if (busy.current || !version) return;
    busy.current = true;
    setAccepting(true);
    setErrorKey(null);
    try {
      queryClient.setQueryData(consentKey, await deps.acceptTerms(version));
    } catch (error) {
      setErrorKey(translateError(error).messageKey);
      // A newer version may have been published meanwhile: show it.
      void consent.refetch();
    } finally {
      busy.current = false;
      setAccepting(false);
    }
  }, [consent, deps, queryClient]);

  const c = consent.data;
  return {
    state: {
      consent: c ?? null,
      /** Unknown (offline, error) never blocks the app. */
      required: !!c && needsConsent(c),
      accepting,
      errorKey,
    },
    actions: {
      accept,
      openPrivacy: () => (c?.privacyUrl ? void deps.openUrl(c.privacyUrl) : undefined),
      openTerms: () => (c?.termsUrl ? void deps.openUrl(c.termsUrl) : undefined),
    },
  };
}
