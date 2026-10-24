import { DEFAULT_CLIENT_CONFIG } from '@ds/contracts';
import { logger } from '@/core/logging/logger';
import type { AppInfo } from '../../domain/entities/Diagnostics';
import type { BackendHealth, ClientConfigSummary, DiagnosticsRepository } from '../../domain/repositories/DiagnosticsRepository';
import type { AppInfoDataSource } from '../datasources/local/AppInfoDataSource';
import type { SupabaseHealthDataSource } from '../datasources/remote/SupabaseHealthDataSource';

export class DiagnosticsRepositoryImpl implements DiagnosticsRepository {
  constructor(
    private readonly appInfo: AppInfoDataSource,
    private readonly health: SupabaseHealthDataSource | null,
  ) {}

  getAppInfo(): AppInfo {
    const dto = this.appInfo.read();
    return { appVersion: dto.version, appEnv: dto.appEnv, backendConfigured: dto.backendConfigured, envIssues: dto.issues };
  }

  async checkBackendHealth(): Promise<BackendHealth> {
    if (!this.health) return { status: 'not_configured', latencyMs: null };
    try {
      const result = await this.health.check();
      return result.ok ? { status: 'reachable', latencyMs: result.latencyMs } : { status: 'unreachable', latencyMs: null };
    } catch (error) {
      // An unreachable server is a reportable state on this screen, not an error.
      logger.warn('backend health check failed', { error: String(error) });
      return { status: 'unreachable', latencyMs: null };
    }
  }

  async getClientConfigSummary(): Promise<ClientConfigSummary> {
    // get_client_config does not exist until Phase 02; until then the bundled defaults are in use.
    return { revision: DEFAULT_CLIENT_CONFIG.revision, source: 'bundled' };
  }
}
