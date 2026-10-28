import 'server-only';
import { rpc } from '@/core/admin/rpc';
import type { AdminSupabaseClient } from '@/core/supabase/server';

export interface ShopListItem {
  shopId: string;
  name: string;
  city: string | null;
  status: 'active' | 'suspended' | 'closed';
  createdAt: string;
  phone: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  lastSaleAt: string | null;
}

export interface ShopDetail {
  shop: {
    shopId: string;
    name: string;
    status: string;
    city: string | null;
    businessCategory: string;
    phone: string | null;
    createdAt: string;
  };
  subscription: {
    plan: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
  members: {
    userId: string;
    role: string;
    status: string;
    name: string | null;
    phone: string | null;
    joinedAt: string;
  }[];
  devices: {
    deviceId: string;
    code: string;
    platform: string;
    status: string;
    appVersion: string | null;
    lastSeenAt: string;
  }[];
  usage: {
    products: number;
    customers: number;
    bills30d: number;
    needsReview30d: number;
    lastSaleAt: string | null;
  };
  onboarding: { id: string; status: string; method: string; createdAt: string }[];
  tickets: { id: string; subject: string; status: string; lastMessageAt: string }[];
}

/** admin_* shop RPCs (role + MFA + audit in the database). */
export class ShopsRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  list(query: string, status: string | null, cursor: string | null) {
    return rpc<{ items: ShopListItem[]; nextCursor: string | null }>(this.client, 'admin_list_shops', {
      p_query: query || null,
      p_status: status,
      p_cursor: cursor,
      p_limit: 50,
    });
  }

  get(shopId: string) {
    return rpc<ShopDetail>(this.client, 'admin_get_shop', { p_shop_id: shopId });
  }

  setStatus(shopId: string, status: 'active' | 'suspended', reason: string) {
    return rpc(this.client, 'admin_set_shop_status', {
      p_shop_id: shopId,
      p_status: status,
      p_reason: reason,
    });
  }

  deactivateMember(shopId: string, userId: string, reason: string) {
    return rpc(this.client, 'admin_deactivate_member', {
      p_shop_id: shopId,
      p_user_id: userId,
      p_reason: reason,
    });
  }

  revokeDevice(shopId: string, deviceId: string, reason: string) {
    return rpc(this.client, 'admin_revoke_device', {
      p_shop_id: shopId,
      p_device_id: deviceId,
      p_reason: reason,
    });
  }
}
