import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

/**
 * Connectivity state shared by the whole app (MVVM_ARCHITECTURE.md §7).
 * `isOnline` is true only when a connection exists and the internet is not known to be unreachable.
 */

export interface ConnectivityState {
  isOnline: boolean;
  lastChangedAt: number | null;
}

export const useConnectivityStore = create<ConnectivityState>(() => ({ isOnline: true, lastChangedAt: null }));

export function toOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** Starts listening to NetInfo; returns the unsubscribe function. Called once by AppProviders. */
export function startConnectivityMonitoring(): () => void {
  return NetInfo.addEventListener((state) => {
    const isOnline = toOnline(state);
    if (useConnectivityStore.getState().isOnline !== isOnline) {
      useConnectivityStore.setState({ isOnline, lastChangedAt: Date.now() });
    }
  });
}
