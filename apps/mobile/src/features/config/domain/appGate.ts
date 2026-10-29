import { type ClientConfig, compareSemver } from '@ds/contracts';

export interface AppGateState {
  /** Older than app.min_supported_version: the app shows only the update screen (the server refuses writes too). */
  updateRequired: boolean;
  /** A newer version exists; a dismissible hint. */
  updateAvailable: boolean;
  maintenance: ClientConfig['maintenance'] | null;
}

/** What the root of the app shows for the current platform config (FEATURE_CONFIGURATION.md §8). */
export function appGateState(config: ClientConfig, appVersion: string): AppGateState {
  return {
    updateRequired: compareSemver(appVersion, config.minSupportedAppVersion) < 0,
    updateAvailable: !!config.latestAppVersion && compareSemver(appVersion, config.latestAppVersion) < 0,
    maintenance: config.maintenance?.active ? config.maintenance : null,
  };
}

export const PLAY_STORE_URL = 'market://details?id=in.dukaansaathi.app';
export const PLAY_STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=in.dukaansaathi.app';
