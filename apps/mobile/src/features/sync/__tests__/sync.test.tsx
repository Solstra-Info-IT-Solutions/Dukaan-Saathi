import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { MoreScreen } from '@/features/account/presentation/screens/MoreScreen';
import type { BillingRepository } from '@/features/billing/domain/repositories/BillingRepository';
import type {
  BillingContext,
  InvoiceCounterStore,
  OfflineSales,
  Sale,
  SaleCommand,
} from '@/features/billing/domain/entities/Bill';
import { CreateSale, GetSale } from '@/features/billing/domain/usecases/billingUseCases';
import type { CustomerRepository } from '@/features/customers/domain/repositories/CustomerRepository';
import { RecordRepayment } from '@/features/customers/domain/usecases/customerUseCases';
import { ActivateShop, LoadMyContext, RestoreSession } from '@/features/shops/domain/usecases/shopUseCases';
import { sessionActions } from '@/core/session/sessionStore';
import { memoryDatabase } from '../../../../tests/fakes/nodeSqlite';
import {
  baseSettings,
  context as shopContext,
  FakeDeviceRepository,
  FakeShopRepository,
  membership,
  memoryLastShop,
  SHOP_A,
  USER,
} from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import { SqliteSyncStore } from '../data/datasources/local/SqliteSyncStore';
import { SyncService } from '../data/SyncService';
import type { OperationResult, PullPage, PushBatch, SyncRemote } from '../domain/entities/Sync';
import {
  backoffMs,
  GetSyncQueue,
  PullChanges,
  PushOutbox,
  RetryOperation,
} from '../domain/usecases/syncUseCases';
import { SyncStatusScreen } from '../presentation/screens/SyncStatusScreen';
import { chipState } from '../presentation/viewmodels/useSyncStatusViewModel';

const DEVICE = '0190f0f0-0000-7000-8000-0000000000d1';
let ids = 0;
const newId = () => `0190f0f0-0000-7000-8000-${String(++ids).padStart(12, '0')}`;

class Clock {
  t = new Date('2026-10-26T05:30:00.000Z');
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
}

/**
 * A server that applies each operation once (by client operation id), like sync_push. `rule` decides the outcome
 * for an operation that has not been seen yet.
 */
class FakeServer implements SyncRemote {
  calls: PushBatch[] = [];
  applied = new Map<string, Record<string, unknown>>();
  offline = false;
  rule: (op: PushBatch['operations'][number]) => OperationResult['status'] | { quarantined: string } = () =>
    'applied';
  pages: PullPage[] = [];

  async push(batch: PushBatch): Promise<OperationResult[]> {
    if (this.offline) throw new AppError('NETWORK_OFFLINE');
    this.calls.push(batch);
    return batch.operations.map((op) => {
      if (this.applied.has(op.clientOperationId)) {
        return { clientOperationId: op.clientOperationId, status: 'replayed', result: { replayed: true } };
      }
      const outcome = this.rule(op);
      if (typeof outcome === 'object') {
        return { clientOperationId: op.clientOperationId, status: 'quarantined', code: outcome.quarantined };
      }
      if (outcome === 'retry')
        return { clientOperationId: op.clientOperationId, status: 'retry', code: '40P01' };
      this.applied.set(op.clientOperationId, op.payload);
      return {
        clientOperationId: op.clientOperationId,
        status: outcome,
        result: outcome === 'needs_review' ? { reviewReasons: ['price_changed'] } : {},
      };
    });
  }
  async pull(): Promise<PullPage> {
    if (this.offline) throw new AppError('NETWORK_OFFLINE');
    return this.pages.shift() ?? emptyPage();
  }
}

const emptyPage = (over: Partial<PullPage> = {}): PullPage => ({
  serverTime: '2026-10-26T05:30:00Z',
  products: { rows: [], cursor: null, more: false },
  categories: { rows: [], cursor: null, more: false },
  customers: { rows: [], cursor: null, more: false },
  customerAliases: { rows: [], cursor: null },
  settings: {},
  ...over,
});

const product = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  nameHi: null,
  categoryId: null,
  unitCode: 'pc',
  pricePaise: 4500,
  mrpPaise: null,
  taxRateCode: null,
  hsnCode: null,
  trackStock: false,
  stockOnHandMilli: 0,
  lowStockThresholdMilli: null,
  isActive: true,
  barcodes: [] as string[],
  aliases: [] as string[],
  updatedAt: '2026-10-26T05:00:00Z',
  archivedAt: null,
  ...over,
});

const customer = (id: string, name: string, phone: string | null = null) => ({
  id,
  name,
  phone,
  note: null,
  creditLimitPaise: null,
  balancePaise: 0,
  udhaarSince: null,
  lastActivityAt: null,
  archivedAt: null,
  createdAt: '2026-10-26T05:00:00Z',
  updatedAt: '2026-10-26T05:00:00Z',
});

function setup() {
  const db = memoryDatabase();
  const store = new SqliteSyncStore(db);
  const server = new FakeServer();
  const clock = new Clock();
  const push = new PushOutbox(store, server, clock, () => 0);
  const queueBill = (n: number, extra: Record<string, unknown> = {}) => {
    const id = newId();
    store.queueSale(
      {
        id,
        shopId: SHOP_A,
        userId: USER,
        operation: 'create_sale',
        payload: { clientOperationId: id, shopId: SHOP_A, ...extra },
        label: `B-${n}`,
      },
      `sale-${id}`,
      { invoiceNumber: `B-${n}` },
      clock.now().toISOString(),
    );
    clock.advance(1); // keep creation order distinct
    return id;
  };
  return { db, store, server, clock, push, queueBill };
}

describe('outbox and push', () => {
  it('50 bills made offline survive a restart of the app and are sent exactly once, in order', async () => {
    const { db, server, clock, queueBill } = setup();
    const opIds = Array.from({ length: 55 }, (_, i) => queueBill(i + 1));
    // "App killed": a new store and service on the same database file.
    const reopened = new SqliteSyncStore(db);
    const report = await new PushOutbox(reopened, server, clock, () => 0).execute(SHOP_A, DEVICE, USER);
    expect(server.calls.map((c) => c.operations.length)).toEqual([50, 5]);
    expect(server.calls.flatMap((c) => c.operations.map((o) => o.clientOperationId))).toEqual(opIds);
    expect(report).toMatchObject({ sent: 55, applied: 55, offline: false });
    expect(reopened.open(SHOP_A, USER)).toEqual([]);
    expect(reopened.localSale(`sale-${opIds[0]}`)).toBeNull(); // the server copy is the receipt now
    // Running again sends nothing; even if the server had seen them, it would only replay.
    await new PushOutbox(reopened, server, clock, () => 0).execute(SHOP_A, DEVICE, USER);
    expect(server.calls).toHaveLength(2);
    expect(server.applied.size).toBe(55);
  });

  it('without a connection nothing is lost: retried with backoff, then sent', async () => {
    const { store, server, clock, push, queueBill } = setup();
    queueBill(1);
    server.offline = true;
    expect((await push.execute(SHOP_A, DEVICE, USER)).offline).toBe(true);
    const [waiting] = store.open(SHOP_A, USER);
    expect(waiting).toMatchObject({ status: 'pending', attempts: 1, lastError: 'NETWORK_OFFLINE' });
    server.offline = false;
    await push.execute(SHOP_A, DEVICE, USER);
    expect(server.calls).toHaveLength(0); // not due for 5 s
    clock.advance(5000);
    await push.execute(SHOP_A, DEVICE, USER);
    expect(server.applied.size).toBe(1);
    expect([1, 2, 3, 4, 5, 9].map((a) => backoffMs(a, () => 0) / 1000)).toEqual([5, 15, 60, 300, 900, 900]);
  });

  it('records each result: applied, flagged, quarantined, retry; a bill for an unsaved customer is held', async () => {
    const { store, server, clock, push, queueBill } = setup();
    const ok = queueBill(1);
    const flagged = queueBill(2, { flag: true });
    const refused = queueBill(3, { refuse: true });
    const busy = queueBill(4, { busy: true });
    const custId = newId();
    store.queueCustomer(
      {
        id: custId,
        shopId: SHOP_A,
        userId: USER,
        operation: 'create_customer',
        payload: { id: custId, shopId: SHOP_A },
        label: 'Raju',
      },
      customer(custId, 'Raju'),
      clock.now().toISOString(),
    );
    clock.advance(1);
    server.rule = (op) =>
      op.payload.flag
        ? 'needs_review'
        : op.payload.refuse
          ? { quarantined: 'DS_NOT_A_MEMBER' }
          : op.payload.busy
            ? 'retry'
            : op.operation === 'create_customer'
              ? { quarantined: 'DS_QUOTA_EXCEEDED' }
              : 'applied';
    await push.execute(SHOP_A, DEVICE, USER);
    const udhaarBill = queueBill(5, { customerId: custId });
    await push.execute(SHOP_A, DEVICE, USER);

    const byId = new Map(store.attention(SHOP_A).map((e) => [e.id, e]));
    expect(byId.get(flagged)).toMatchObject({ status: 'done', reviewReasons: ['price_changed'] });
    expect(byId.get(refused)).toMatchObject({ status: 'quarantined', lastError: 'DS_NOT_A_MEMBER' });
    expect(byId.get(custId)).toMatchObject({ status: 'quarantined', lastError: 'DS_QUOTA_EXCEEDED' });
    expect(byId.get(udhaarBill)).toMatchObject({ status: 'blocked', lastError: 'CUSTOMER_NOT_SAVED' });
    expect(byId.has(ok)).toBe(false);
    expect(store.open(SHOP_A, USER).find((e) => e.id === busy)).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
    expect(server.calls.flatMap((c) => c.operations.map((o) => o.clientOperationId))).not.toContain(
      udhaarBill,
    );

    // Owner fixes the cause and taps "Try again".
    server.rule = () => 'applied';
    new RetryOperation(store, { nudge: jest.fn(), syncNow: jest.fn() }, clock).execute(refused);
    await push.execute(SHOP_A, DEVICE, USER);
    expect(server.applied.has(refused)).toBe(true);
  });

  it('bills of another user on this phone are never sent under the signed-in account', async () => {
    const { store, server, push, clock } = setup();
    store.enqueue(
      {
        id: newId(),
        shopId: SHOP_A,
        userId: 'someone-else',
        operation: 'create_sale',
        payload: { shopId: SHOP_A },
        label: null,
      },
      clock.now().toISOString(),
    );
    await push.execute(SHOP_A, DEVICE, USER);
    expect(server.calls).toHaveLength(0);
    expect(store.unsentCount('someone-else')).toBe(1);
  });
});

describe('pull and offline copies', () => {
  it('keeps the catalogue and customers on the phone, drops archived items and merged customers', async () => {
    const { store, server } = setup();
    const localRaju = newId();
    store.putCustomer(SHOP_A, customer(localRaju, 'Raju (added here)'));
    server.pages = [
      emptyPage({
        products: {
          rows: [
            product('0190f0f0-0000-7000-8000-0000000000e1', 'Sugar 1kg', { barcodes: ['8901'] }),
            product('0190f0f0-0000-7000-8000-0000000000e2', 'Old soap', {
              archivedAt: '2026-10-01T00:00:00Z',
            }),
          ],
          cursor: 'c1',
          more: true,
        },
      }),
      emptyPage({
        products: {
          rows: [product('0190f0f0-0000-7000-8000-0000000000e3', 'Atta', { aliases: ['aata'] })],
          cursor: 'c2',
          more: false,
        },
        customers: {
          rows: [customer('0190f0f0-0000-7000-8000-0000000000c1', 'Raju', '+919855555555')],
          cursor: 'k1',
          more: false,
        },
        customerAliases: {
          rows: [{ aliasId: localRaju, customerId: '0190f0f0-0000-7000-8000-0000000000c1' }],
          cursor: 'a1',
        },
      }),
    ];
    expect(await new PullChanges(store, server).execute(SHOP_A, DEVICE)).toEqual({ pages: 2 });
    expect(store.searchProducts(SHOP_A, 'sug', 10).map((p) => p.name)).toEqual(['Sugar 1kg']);
    expect(store.searchProducts(SHOP_A, 'soap', 10)).toEqual([]);
    expect(store.searchProducts(SHOP_A, 'aata', 10).map((p) => p.name)).toEqual(['Atta']);
    expect(store.productByBarcode(SHOP_A, '8901')?.name).toBe('Sugar 1kg');
    expect(store.searchCustomers(SHOP_A, 'raju', 10).map((c) => c.name)).toEqual(['Raju']);
    expect(store.searchCustomers(SHOP_A, '98555', 10)).toHaveLength(1);
    expect(store.resolveCustomer(SHOP_A, localRaju)).toBe('0190f0f0-0000-7000-8000-0000000000c1');
    expect(store.cursors(SHOP_A)).toEqual({
      products: 'c2',
      categories: null,
      customers: 'k1',
      aliases: 'a1',
    });
  });
});

// ---- billing offline ---------------------------------------------------------------------------
const billingContext: BillingContext = {
  shopId: SHOP_A,
  shopName: 'Sharma Kirana',
  role: 'cashier',
  canDiscount: false,
  canOverridePrice: false,
  canManageProducts: false,
  deviceId: DEVICE,
  deviceCode: 'A',
  invoicePrefix: 'DS',
  fy: '2627',
  lastSeq: 7,
};
const memoryCounter = (): InvoiceCounterStore & { values: Map<string, number> } => {
  const values = new Map<string, number>();
  return { values, last: async (k) => values.get(k) ?? null, save: async (k, v) => void values.set(k, v) };
};

function offlineSales(store: SqliteSyncStore, online: { value: boolean }): OfflineSales {
  return {
    isOnline: () => online.value,
    hasWaitingSales: (shopId) =>
      store.open(shopId, USER).some((e) => e.operation === 'create_sale' && e.status === 'pending'),
    queue: async (command, receipt) =>
      store.queueSale(
        {
          id: command.clientOperationId,
          shopId: command.shopId,
          userId: USER,
          operation: 'create_sale',
          payload: command,
          label: receipt.invoiceNumber,
        },
        command.saleId,
        receipt,
        '2026-10-26T05:30:00.000Z',
      ),
    localSale: (saleId) => {
      const l = store.localSale(saleId);
      return l
        ? {
            ...(l.receipt as Sale),
            local: { state: l.status === 'pending' ? 'pending' : 'quarantined', code: l.error },
          }
        : null;
    },
  };
}

describe('billing without a connection', () => {
  const draft = {
    lines: [{ kind: 'quick' as const, key: 'k', label: 'doodh', amountPaise: 5000 }],
    billDiscountPaise: 0,
  };
  const attempt = () => ({
    clientOperationId: newId(),
    saleId: newId(),
    occurredAt: '2026-10-26T05:30:00.000Z',
  });

  it('offline: the bill is saved on the phone with the next number and a receipt; later bills queue behind it', async () => {
    const { store } = setup();
    const online = { value: false };
    const remote = { createSale: jest.fn(), getSale: jest.fn() } as unknown as BillingRepository;
    const counter = memoryCounter();
    const create = new CreateSale(remote, counter, offlineSales(store, online));
    const a1 = attempt();
    const created = await create.execute({
      context: billingContext,
      settings: baseSettings,
      draft,
      payments: [{ method: 'cash', amountPaise: 5000 }],
      attempt: a1,
    });
    expect(created).toMatchObject({
      saleId: a1.saleId,
      invoiceNumber: 'DS/2627/A-000008',
      seq: 8,
      queued: true,
    });
    expect(remote.createSale).not.toHaveBeenCalled();
    const [entry] = store.open(SHOP_A, USER);
    expect(entry?.payload).toMatchObject({
      clientOperationId: a1.clientOperationId,
      saleId: a1.saleId,
      origin: 'offline_sync',
      invoice: { fy: '2627', seq: 8 },
    });
    const receipt = await new GetSale(remote, offlineSales(store, online)).execute(SHOP_A, a1.saleId);
    expect(receipt).toMatchObject({
      invoiceNumber: 'DS/2627/A-000008',
      local: { state: 'pending' },
      lines: [{ label: 'doodh', netPaise: 5000 }],
    });

    // Back online, but bill 8 is still waiting: bill 9 queues behind it so numbers reach the server in order.
    online.value = true;
    const second = await create.execute({
      context: billingContext,
      settings: baseSettings,
      draft,
      payments: [{ method: 'cash', amountPaise: 5000 }],
      attempt: attempt(),
    });
    expect(second).toMatchObject({ seq: 9, queued: true });
    expect(remote.createSale).not.toHaveBeenCalled();
  });

  it('online with no answer from the server: queued with the same operation id', async () => {
    const { store } = setup();
    const sent: SaleCommand[] = [];
    const remote = {
      createSale: async (c: SaleCommand) => {
        sent.push(c);
        throw new AppError('NETWORK_TIMEOUT');
      },
    } as unknown as BillingRepository;
    const a = attempt();
    const created = await new CreateSale(
      remote,
      memoryCounter(),
      offlineSales(store, { value: true }),
    ).execute({
      context: billingContext,
      settings: baseSettings,
      draft,
      payments: [{ method: 'cash', amountPaise: 5000 }],
      attempt: a,
    });
    expect(created.queued).toBe(true);
    const [entry] = store.open(SHOP_A, USER);
    expect(entry?.id).toBe(a.clientOperationId);
    // Apart from the origin, the queued payload is exactly what was sent online (one idempotency key, ADR-055).
    const { origin: _o, ...queued } = entry!.payload as SaleCommand;
    const { origin: _p, ...online } = sent[0]!;
    expect(queued).toEqual(online);
  });

  it('an udhaar payment without a connection is queued', async () => {
    const { store } = setup();
    const repo = { recordRepayment: jest.fn() } as unknown as CustomerRepository;
    const result = await new RecordRepayment(repo, {
      isOnline: () => false,
      queue: async (command, label) =>
        store.enqueue(
          {
            id: command.clientOperationId,
            shopId: SHOP_A,
            userId: USER,
            operation: 'record_customer_repayment',
            payload: command,
            label,
          },
          '2026-10-26T05:30:00Z',
        ),
    }).execute({
      clientOperationId: newId(),
      shopId: SHOP_A,
      deviceId: DEVICE,
      customerId: newId(),
      amountText: '200',
      method: 'cash',
      note: '',
      label: 'Raju',
    });
    expect(result).toEqual({ balancePaise: null, queued: true });
    expect(store.open(SHOP_A, USER)[0]).toMatchObject({
      operation: 'record_customer_repayment',
      label: 'Raju',
      payload: { amountPaise: 20000 },
    });
  });
});

describe('session and status UX', () => {
  it('opens the last shop without a connection', async () => {
    const shops = new FakeShopRepository();
    shops.ctx = shopContext([membership(SHOP_A, 'Sharma Kirana')]);
    const last = memoryLastShop();
    let saved: string | null = null;
    const snapshot = {
      load: async () => saved,
      save: async (j: string) => void (saved = j),
      clear: async () => void (saved = null),
    };
    const devices = new FakeDeviceRepository();
    const restore = new RestoreSession(
      new LoadMyContext(shops),
      new ActivateShop(devices, last),
      last,
      snapshot,
    );
    expect((await restore.execute()).offline).toBeUndefined();
    jest.spyOn(shops, 'getMyContext').mockRejectedValue(new AppError('NETWORK_OFFLINE'));
    const offline = await restore.execute();
    expect(offline).toMatchObject({ offline: true, activation: { shopId: SHOP_A, deviceCode: 'A' } });
  });

  it('chip: attention first, then syncing, waiting (offline), synced', () => {
    expect(chipState({ pending: 3, attention: 1, syncing: true }, true)).toEqual({
      kind: 'attention',
      count: 1,
    });
    expect(chipState({ pending: 3, attention: 0, syncing: true }, true)).toEqual({ kind: 'syncing' });
    expect(chipState({ pending: 3, attention: 0, syncing: false }, false)).toEqual({
      kind: 'waiting',
      count: 3,
      offline: true,
    });
    expect(chipState({ pending: 0, attention: 0, syncing: false }, true)).toEqual({ kind: 'synced' });
  });

  it('the status screen lists what is waiting and what was not saved, and retries it', async () => {
    const { store, server, clock, queueBill, push } = setup();
    const refused = queueBill(12, { refuse: true });
    queueBill(13);
    server.rule = (op) => (op.payload.refuse ? { quarantined: 'DS_NOT_A_MEMBER' } : 'applied');
    server.offline = true;
    const service = new SyncService({
      push,
      pull: new PullChanges(store, server),
      store,
      isOnline: () => !server.offline,
      publish: jest.fn(),
      now: clock.now,
    });
    const trigger = { syncNow: () => service.syncNow(), nudge: jest.fn() };
    await renderWithProviders(
      <SyncStatusScreen
        deps={{
          getQueue: new GetSyncQueue(store),
          retry: new RetryOperation(store, trigger, clock),
          trigger,
        }}
        shopId={SHOP_A}
        userId={USER}
        onOpenSale={jest.fn()}
      />,
    );
    expect(await screen.findByText('Waiting to be sent (2)')).toBeTruthy();
    expect(screen.getByText('Bill · B-12')).toBeTruthy();
    server.offline = false;
    service.start({ shopId: SHOP_A, deviceId: DEVICE, userId: USER });
    await fireEvent.press(screen.getByText('Sync now'));
    expect(
      await screen.findByText(
        /Not saved on the server: You are no longer a member of this shop|Not saved on the server/,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Waiting to be sent (0)')).toBeTruthy();
    server.rule = () => 'applied';
    await fireEvent.press(screen.getByText('Try again'));
    expect(store.open(SHOP_A, USER).find((e) => e.id === refused)?.status).toBe('pending');
    service.stop();
  });

  it('signing out with unsent bills asks first; they stay on the phone', async () => {
    sessionActions.signedIn(USER, null);
    const signOut = { execute: jest.fn(async () => {}) };
    await renderWithProviders(
      <MoreScreen deps={{ signOut, unsentCount: () => 2 }} onOpen={jest.fn()} onSwitchShop={jest.fn()} />,
    );
    await fireEvent.press(screen.getByText('Sign out'));
    expect(await screen.findByText(/2 bills or payments on this phone are not sent yet/)).toBeTruthy();
    expect(signOut.execute).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Sign out anyway'));
    await waitFor(() => expect(signOut.execute).toHaveBeenCalledTimes(1));
  });
});
