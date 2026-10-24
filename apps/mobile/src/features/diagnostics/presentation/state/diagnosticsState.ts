import type { AppError } from '@/core/errors/AppError';
import type { DiagnosticsReport } from '../../domain/entities/Diagnostics';

export type DiagnosticsStatus = 'loading' | 'loaded' | 'refreshing' | 'error';

export interface DiagnosticsState {
  status: DiagnosticsStatus;
  report: DiagnosticsReport | null;
  error: AppError | null;
}

export type DiagnosticsEvent =
  | { type: 'refreshRequested' }
  | { type: 'loadSucceeded'; report: DiagnosticsReport }
  | { type: 'loadFailed'; error: AppError };

export const initialDiagnosticsState: DiagnosticsState = { status: 'loading', report: null, error: null };

export function diagnosticsReducer(state: DiagnosticsState, event: DiagnosticsEvent): DiagnosticsState {
  switch (event.type) {
    case 'refreshRequested':
      return { ...state, status: state.report ? 'refreshing' : 'loading', error: null };
    case 'loadSucceeded':
      return { status: 'loaded', report: event.report, error: null };
    case 'loadFailed':
      return { ...state, status: 'error', error: event.error };
  }
}
