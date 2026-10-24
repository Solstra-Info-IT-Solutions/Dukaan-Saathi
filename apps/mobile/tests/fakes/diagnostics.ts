import type { DiagnosticsReport } from '@/features/diagnostics/domain/entities/Diagnostics';
import type {
  BackendHealth,
  ClientConfigSummary,
  DiagnosticsRepository,
} from '@/features/diagnostics/domain/repositories/DiagnosticsRepository';

export const sampleReport: DiagnosticsReport = {
  appVersion: '0.1.0',
  appEnv: 'development',
  backendConfigured: true,
  envIssues: [],
  backendStatus: 'reachable',
  backendLatencyMs: 42,
  configRevision: 'bundled',
  configSource: 'bundled',
  checkedAt: 1_700_000_000_000,
};

export class FakeDiagnosticsRepository implements DiagnosticsRepository {
  health: BackendHealth = { status: 'reachable', latencyMs: 42 };
  healthCalls = 0;
  envIssues: string[] = [];

  getAppInfo() {
    return { appVersion: '0.1.0', appEnv: 'development' as const, backendConfigured: true, envIssues: this.envIssues };
  }
  async checkBackendHealth(): Promise<BackendHealth> {
    this.healthCalls += 1;
    return this.health;
  }
  async getClientConfigSummary(): Promise<ClientConfigSummary> {
    return { revision: 'bundled', source: 'bundled' };
  }
}
