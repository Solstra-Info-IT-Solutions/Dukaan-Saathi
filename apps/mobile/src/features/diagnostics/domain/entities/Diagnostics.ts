/** What the diagnostics screen reports. Pure data: no platform types. */

export type BackendStatus = 'not_configured' | 'reachable' | 'unreachable';

export interface AppInfo {
  appVersion: string;
  appEnv: 'development' | 'staging' | 'production';
  backendConfigured: boolean;
  envIssues: string[];
}

export interface DiagnosticsReport extends AppInfo {
  backendStatus: BackendStatus;
  /** Round-trip time of the health check in ms, when reachable. */
  backendLatencyMs: number | null;
  configRevision: string;
  configSource: 'bundled' | 'remote';
  checkedAt: number;
}
