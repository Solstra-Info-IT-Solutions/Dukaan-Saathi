// Public API of the config feature (Phase 13): platform config, update gate, maintenance message.
export { appGateState } from './domain/appGate';
export { SupabaseConfigDataSource } from './data/SupabaseConfigDataSource';
export { AppGate, clientConfigKey } from './presentation/AppGate';
export type { AppGateDeps } from './presentation/AppGate';
