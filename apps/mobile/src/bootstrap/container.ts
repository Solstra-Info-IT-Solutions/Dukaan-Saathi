import type { AppEnv } from '@/core/config/env';
import { createSupabaseClient, type TypedSupabaseClient } from '@/core/network/supabaseClient';
import { createChunkedSecureStorage, type KeyValueStorage } from '@/core/storage/secureStorage';
import {
  AppInfoDataSource,
  type DiagnosticsViewModelDeps,
  DiagnosticsRepositoryImpl,
  GetDiagnostics,
  SupabaseHealthDataSource,
} from '@/features/diagnostics';

/**
 * Composition root (ADR-006): builds data sources → repositories → use cases once and hands
 * typed groups to routes. Tests build their own container with fakes.
 */
export interface Container {
  env: AppEnv;
  supabase: TypedSupabaseClient | null;
  diagnostics: DiagnosticsViewModelDeps;
}

export function createContainer(env: AppEnv, storage: KeyValueStorage = createChunkedSecureStorage()): Container {
  const supabase = env.backend ? createSupabaseClient(env.backend, storage) : null;

  const diagnosticsRepository = new DiagnosticsRepositoryImpl(
    new AppInfoDataSource(env),
    env.backend ? new SupabaseHealthDataSource(env.backend) : null,
  );

  return {
    env,
    supabase,
    diagnostics: { getDiagnostics: new GetDiagnostics(diagnosticsRepository) },
  };
}
