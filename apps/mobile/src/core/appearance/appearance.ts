import { create } from 'zustand';
import type { KeyValueStorage } from '../storage/secureStorage';

/** Light, dark, or follow the phone. Chosen in My profile; remembered on this phone. */
export type AppearanceMode = 'system' | 'light' | 'dark';

const KEY = 'ds.appearance';
const MODES: readonly AppearanceMode[] = ['system', 'light', 'dark'];

interface AppearanceState {
  mode: AppearanceMode;
}

export const useAppearanceStore = create<AppearanceState>(() => ({ mode: 'system' }));

let saveMode: ((mode: AppearanceMode) => Promise<void>) | null = null;

/** Reads the saved choice once at start-up; until then the phone's own setting applies. */
export async function initAppearance(storage: KeyValueStorage): Promise<void> {
  saveMode = (mode) => storage.setItem(KEY, mode);
  try {
    const saved = await storage.getItem(KEY);
    if (saved && (MODES as readonly string[]).includes(saved)) {
      useAppearanceStore.setState({ mode: saved as AppearanceMode });
    }
  } catch {
    // Unreadable storage: keep following the phone.
  }
}

export function setAppearance(mode: AppearanceMode): void {
  useAppearanceStore.setState({ mode });
  void saveMode?.(mode).catch(() => undefined);
}

/** Dark when chosen, or when following a phone that is in dark mode. */
export function resolveDark(mode: AppearanceMode, systemScheme: string | null | undefined): boolean {
  return mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
}
