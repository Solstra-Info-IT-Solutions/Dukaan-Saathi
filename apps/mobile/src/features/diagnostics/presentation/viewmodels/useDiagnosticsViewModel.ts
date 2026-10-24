import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { useConnectivityStore } from '@/core/connectivity/connectivity';
import { translateError } from '@/core/errors/translateError';
import { type Language, setLanguage } from '@/core/localization/i18n';
import type { GetDiagnostics } from '../../domain/usecases/GetDiagnostics';
import { diagnosticsReducer, initialDiagnosticsState } from '../state/diagnosticsState';

export interface DiagnosticsViewModelDeps {
  getDiagnostics: GetDiagnostics;
}

/**
 * ViewModel for the diagnostics screen. Shows the MVVM conventions from MVVM_ARCHITECTURE.md §3:
 * typed state via a pure reducer, explicit actions, duplicate-request guard, cleanup on unmount.
 */
export function useDiagnosticsViewModel({ getDiagnostics }: DiagnosticsViewModelDeps) {
  const [state, dispatch] = useReducer(diagnosticsReducer, initialDiagnosticsState);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // Latest use case in a ref so `refresh` stays stable even if a caller passes new objects each render.
  const useCaseRef = useRef(getDiagnostics);
  useLayoutEffect(() => {
    useCaseRef.current = getDiagnostics;
  }, [getDiagnostics]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // duplicate-request guard
    inFlight.current = true;
    dispatch({ type: 'refreshRequested' });
    try {
      const report = await useCaseRef.current.execute();
      if (mounted.current) dispatch({ type: 'loadSucceeded', report });
    } catch (error) {
      if (mounted.current) dispatch({ type: 'loadFailed', error: translateError(error) });
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const changeLanguage = useCallback((language: Language) => {
    void setLanguage(language);
  }, []);

  return { state: { ...state, isOnline }, actions: { refresh, changeLanguage } };
}

export type DiagnosticsViewModel = ReturnType<typeof useDiagnosticsViewModel>;
