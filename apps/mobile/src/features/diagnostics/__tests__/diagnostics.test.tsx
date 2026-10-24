import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { FakeDiagnosticsRepository, sampleReport } from '../../../../tests/fakes/diagnostics';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import { AppInfoDataSource } from '../data/datasources/local/AppInfoDataSource';
import { SupabaseHealthDataSource } from '../data/datasources/remote/SupabaseHealthDataSource';
import { DiagnosticsRepositoryImpl } from '../data/repositories/DiagnosticsRepositoryImpl';
import { GetDiagnostics } from '../domain/usecases/GetDiagnostics';
import { DiagnosticsScreen } from '../presentation/screens/DiagnosticsScreen';
import { diagnosticsReducer, initialDiagnosticsState } from '../presentation/state/diagnosticsState';
import { useDiagnosticsViewModel } from '../presentation/viewmodels/useDiagnosticsViewModel';

const fixedClock = { now: () => 1_700_000_000_000 };
const backend = { url: 'https://abc.supabase.co/', publishableKey: 'sb_publishable_x' };
const env = { appEnv: 'staging' as const, backend, issues: ['example issue'] };

describe('diagnosticsReducer', () => {
  it('starts loading, then loaded', () => {
    expect(initialDiagnosticsState.status).toBe('loading');
    const loaded = diagnosticsReducer(initialDiagnosticsState, { type: 'loadSucceeded', report: sampleReport });
    expect(loaded).toEqual({ status: 'loaded', report: sampleReport, error: null });
  });
  it('refreshes without dropping the existing report', () => {
    const loaded = diagnosticsReducer(initialDiagnosticsState, { type: 'loadSucceeded', report: sampleReport });
    const refreshing = diagnosticsReducer(loaded, { type: 'refreshRequested' });
    expect(refreshing.status).toBe('refreshing');
    expect(refreshing.report).toBe(sampleReport);
  });
  it('keeps the error for display', () => {
    const error = new AppError('UNKNOWN');
    expect(diagnosticsReducer(initialDiagnosticsState, { type: 'loadFailed', error })).toMatchObject({ status: 'error', error });
  });
});

describe('GetDiagnostics', () => {
  it('combines app info, backend health and config', async () => {
    const report = await new GetDiagnostics(new FakeDiagnosticsRepository(), fixedClock).execute();
    expect(report).toEqual(sampleReport);
  });
});

describe('DiagnosticsRepositoryImpl', () => {
  it('reports not_configured without a backend', async () => {
    const repo = new DiagnosticsRepositoryImpl(new AppInfoDataSource({ ...env, backend: null }, () => '1.2.3'), null);
    expect(repo.getAppInfo()).toEqual({ appVersion: '1.2.3', appEnv: 'staging', backendConfigured: false, envIssues: ['example issue'] });
    expect(await repo.checkBackendHealth()).toEqual({ status: 'not_configured', latencyMs: null });
  });
  it('calls the auth health endpoint with the publishable key', async () => {
    const fetchFn = jest.fn(async () => ({ ok: true }));
    const repo = new DiagnosticsRepositoryImpl(new AppInfoDataSource(env), new SupabaseHealthDataSource(backend, fetchFn));
    const health = await repo.checkBackendHealth();
    expect(health.status).toBe('reachable');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://abc.supabase.co/auth/v1/health',
      expect.objectContaining({ headers: { apikey: 'sb_publishable_x' } }),
    );
  });
  it('maps a failing or throwing endpoint to unreachable', async () => {
    const failing = new DiagnosticsRepositoryImpl(new AppInfoDataSource(env), new SupabaseHealthDataSource(backend, async () => ({ ok: false })));
    expect((await failing.checkBackendHealth()).status).toBe('unreachable');
    const throwing = new DiagnosticsRepositoryImpl(
      new AppInfoDataSource(env),
      new SupabaseHealthDataSource(backend, async () => {
        throw new TypeError('Network request failed');
      }),
    );
    expect((await throwing.checkBackendHealth()).status).toBe('unreachable');
  });
});

describe('useDiagnosticsViewModel', () => {
  it('loads on mount', async () => {
    const getDiagnostics = new GetDiagnostics(new FakeDiagnosticsRepository(), fixedClock);
    const { result } = await renderHook(() => useDiagnosticsViewModel({ getDiagnostics }));
    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    expect(result.current.state.report?.backendStatus).toBe('reachable');
  });
  it('ignores a refresh while one is in flight', async () => {
    const repo = new FakeDiagnosticsRepository();
    // A new use-case object on every render must not cause reload loops.
    const { result } = await renderHook(() => useDiagnosticsViewModel({ getDiagnostics: new GetDiagnostics(repo, fixedClock) }));
    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    expect(repo.healthCalls).toBe(1);
    await act(async () => {
      void result.current.actions.refresh();
      void result.current.actions.refresh();
    });
    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    expect(repo.healthCalls).toBe(2); // mount + one refresh, not three
  });
  it('exposes a translated error when the use case fails', async () => {
    const getDiagnostics = { execute: async () => Promise.reject(new TypeError('Network request failed')) } as unknown as GetDiagnostics;
    const { result } = await renderHook(() => useDiagnosticsViewModel({ getDiagnostics }));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(result.current.state.error?.code).toBe('NETWORK_OFFLINE');
  });
});

describe('DiagnosticsScreen', () => {
  it('renders the report in English', async () => {
    const repo = new FakeDiagnosticsRepository();
    repo.envIssues = ['EXPO_PUBLIC_SUPABASE_URL is not a URL'];
    await renderWithProviders(<DiagnosticsScreen deps={{ getDiagnostics: new GetDiagnostics(repo, fixedClock) }} />);
    expect(await screen.findByText('App status')).toBeOnTheScreen();
    expect(screen.getByText('Connected · 42 ms')).toBeOnTheScreen();
    expect(screen.getByText('₹1,23,456.50')).toBeOnTheScreen();
    expect(screen.getByText('• EXPO_PUBLIC_SUPABASE_URL is not a URL')).toBeOnTheScreen();
  });
  it('renders in Hindi', async () => {
    await renderWithProviders(<DiagnosticsScreen deps={{ getDiagnostics: new GetDiagnostics(new FakeDiagnosticsRepository(), fixedClock) }} />, {
      language: 'hi',
    });
    expect(await screen.findByText('ऐप की स्थिति')).toBeOnTheScreen();
  });
  it('shows an error with retry when loading fails, and recovers', async () => {
    let fail = true;
    const repo = new FakeDiagnosticsRepository();
    const getDiagnostics = {
      execute: async () => {
        if (fail) throw new TypeError('Network request failed');
        return new GetDiagnostics(repo, fixedClock).execute();
      },
    } as unknown as GetDiagnostics;
    await renderWithProviders(<DiagnosticsScreen deps={{ getDiagnostics }} />);
    expect(await screen.findByText('No internet connection.')).toBeOnTheScreen();
    fail = false;
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('App status')).toBeOnTheScreen();
  });
});
