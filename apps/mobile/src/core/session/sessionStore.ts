import type { Permission, ShopRole } from '@ds/contracts';
import { create } from 'zustand';

/**
 * Who is signed in and which shop is active (MVVM_ARCHITECTURE.md §7).
 * Permissions are a display aid for hiding UI; the server re-checks every call.
 */

export interface ActiveShop {
  shopId: string;
  shopName: string;
  role: ShopRole;
  permissions: readonly Permission[];
  deviceId: string;
  deviceCode: string;
  invoicePrefix: string;
  fy: string;
  lastSeq: number;
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SessionState {
  authStatus: AuthStatus;
  userId: string | null;
  activeShop: ActiveShop | null;
  /** Set when the session was restored but the shop could not be activated (e.g. offline). */
  restoreError: string | null;
}

export const initialSessionState: SessionState = {
  authStatus: 'loading',
  userId: null,
  activeShop: null,
  restoreError: null,
};

export const useSessionStore = create<SessionState>(() => initialSessionState);

export const sessionActions = {
  signedOut: () => useSessionStore.setState({ ...initialSessionState, authStatus: 'signedOut' }),
  signedIn: (userId: string, activeShop: ActiveShop | null, restoreError: string | null = null) =>
    useSessionStore.setState({ authStatus: 'signedIn', userId, activeShop, restoreError }),
  setActiveShop: (activeShop: ActiveShop | null) =>
    useSessionStore.setState({ activeShop, restoreError: null }),
};

export function hasPermission(shop: ActiveShop | null, permission: Permission): boolean {
  return shop?.permissions.includes(permission) ?? false;
}

export function useHasPermission(permission: Permission): boolean {
  return useSessionStore((s) => hasPermission(s.activeShop, permission));
}
