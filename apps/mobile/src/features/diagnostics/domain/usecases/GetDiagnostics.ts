import type { DiagnosticsReport } from '../entities/Diagnostics';
import type { DiagnosticsRepository } from '../repositories/DiagnosticsRepository';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** Collects app info, backend health and config source into one report. */
export class GetDiagnostics {
  constructor(
    private readonly repository: DiagnosticsRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(): Promise<DiagnosticsReport> {
    const info = this.repository.getAppInfo();
    const [health, config] = await Promise.all([
      this.repository.checkBackendHealth(),
      this.repository.getClientConfigSummary(),
    ]);
    return {
      ...info,
      backendStatus: health.status,
      backendLatencyMs: health.latencyMs,
      configRevision: config.revision,
      configSource: config.source,
      checkedAt: this.clock.now(),
    };
  }
}
