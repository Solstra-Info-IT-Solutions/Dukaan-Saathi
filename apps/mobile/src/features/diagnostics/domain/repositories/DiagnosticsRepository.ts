import type { AppInfo, BackendStatus } from '../entities/Diagnostics';

export interface BackendHealth {
  status: BackendStatus;
  latencyMs: number | null;
}

export interface ClientConfigSummary {
  revision: string;
  source: 'bundled' | 'remote';
}

export interface DiagnosticsRepository {
  getAppInfo(): AppInfo;
  checkBackendHealth(): Promise<BackendHealth>;
  getClientConfigSummary(): Promise<ClientConfigSummary>;
}
