import { CreateShopInputSchema, ShopSettingsPatchSchema } from '@ds/contracts';
import type { z } from 'zod';
import type {
  Membership,
  MyContext,
  NewShop,
  ShopActivation,
  ShopEntitlements,
  ShopSettings,
  ShopSettingsPatch,
} from '../entities/Shop';
import { ShopInputError } from '../errors';
import type { DeviceRepository, LastShopPreference, ShopRepository } from '../repositories/ShopRepository';

function fieldIssues(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    fields[key] ??= issue.message;
  }
  return fields;
}

/**
 * Which shop to open without asking: the last one used if still a member, otherwise the only one —
 * unless there are invitations waiting, which the user should see first.
 */
export function pickInitialShop(context: MyContext, lastShopId: string | null): Membership | null {
  const active = context.memberships.filter((m) => m.shopStatus === 'active');
  const last = active.find((m) => m.shopId === lastShopId);
  if (last) return last;
  if (active.length === 1 && context.invitations.length === 0) return active[0] ?? null;
  return null;
}

export class LoadMyContext {
  constructor(private readonly shops: ShopRepository) {}
  execute(): Promise<MyContext> {
    return this.shops.getMyContext();
  }
}

/** Opens a shop on this device: registers the device and remembers the choice. */
export class ActivateShop {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly lastShop: LastShopPreference,
  ) {}

  async execute(membership: Membership): Promise<ShopActivation> {
    const device = await this.devices.registerDevice(membership.shopId);
    await this.lastShop.set(membership.shopId);
    return {
      shopId: membership.shopId,
      shopName: membership.shopName,
      role: membership.role,
      permissions: membership.permissions,
      ...device,
    };
  }
}

export interface RestoredSession {
  context: MyContext;
  activation: ShopActivation | null;
}

/** After sign-in or app start: load memberships and reopen the right shop if it is obvious. */
export class RestoreSession {
  constructor(
    private readonly loadContext: LoadMyContext,
    private readonly activateShop: ActivateShop,
    private readonly lastShop: LastShopPreference,
  ) {}

  async execute(): Promise<RestoredSession> {
    const [context, lastShopId] = await Promise.all([this.loadContext.execute(), this.lastShop.get()]);
    const initial = pickInitialShop(context, lastShopId);
    return { context, activation: initial ? await this.activateShop.execute(initial) : null };
  }
}

export class CreateShop {
  constructor(
    private readonly shops: ShopRepository,
    private readonly newId: () => string,
  ) {}

  /** Validates, then creates the shop with a fresh idempotency key. Returns the new shop id. */
  async execute(input: NewShop, clientOperationId: string = this.newId()): Promise<string> {
    const parsed = CreateShopInputSchema.safeParse({ ...input, clientOperationId });
    if (!parsed.success) throw new ShopInputError(fieldIssues(parsed.error));
    const { shopId } = await this.shops.createShop(parsed.data);
    return shopId;
  }
}

export class AcceptInvitation {
  constructor(private readonly shops: ShopRepository) {}
  async execute(invitationId: string): Promise<string> {
    return (await this.shops.acceptInvitation(invitationId)).shopId;
  }
}

export class GetShopSettings {
  constructor(private readonly shops: ShopRepository) {}
  execute(shopId: string): Promise<ShopSettings> {
    return this.shops.getSettings(shopId);
  }
}

export class UpdateShopSettings {
  constructor(private readonly shops: ShopRepository) {}

  /** Sends only the given fields; validates them with the same rules as the database. */
  async execute(shopId: string, patch: ShopSettingsPatch): Promise<ShopSettings> {
    const parsed = ShopSettingsPatchSchema.safeParse(patch);
    if (!parsed.success) throw new ShopInputError(fieldIssues(parsed.error));
    return this.shops.updateSettings(shopId, parsed.data);
  }
}

export class GetShopEntitlements {
  constructor(private readonly shops: ShopRepository) {}
  execute(shopId: string): Promise<ShopEntitlements> {
    return this.shops.getEntitlements(shopId);
  }
}

/** Whole days left in a trial, never negative. */
export function trialDaysLeft(trialEndsAt: string | null, now: number): number | null {
  if (!trialEndsAt) return null;
  const ms = Date.parse(trialEndsAt) - now;
  return Number.isNaN(ms) ? null : Math.max(0, Math.ceil(ms / 86_400_000));
}
