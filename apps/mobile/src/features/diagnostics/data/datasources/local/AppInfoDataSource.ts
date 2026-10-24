import Constants from 'expo-constants';
import type { AppEnv } from '@/core/config/env';

export interface AppInfoDto {
  version: string;
  appEnv: AppEnv['appEnv'];
  backendConfigured: boolean;
  issues: string[];
}

/** Reads build-time information: app version from the Expo config and the validated environment. */
export class AppInfoDataSource {
  constructor(
    private readonly env: AppEnv,
    private readonly readVersion: () => string | undefined = () => Constants.expoConfig?.version,
  ) {}

  read(): AppInfoDto {
    return {
      version: this.readVersion() ?? '0.0.0',
      appEnv: this.env.appEnv,
      backendConfigured: this.env.backend !== null,
      issues: this.env.issues,
    };
  }
}
