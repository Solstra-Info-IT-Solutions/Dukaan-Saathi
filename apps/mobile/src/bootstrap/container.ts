import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { normalizeIndianPhone, type ProductDto } from '@ds/contracts';
import type { AppEnv } from '@/core/config/env';
import { useConnectivityStore } from '@/core/connectivity/connectivity';
import { openAppDatabase } from '@/core/database/expoSqlite';
import { createExpoSpeechRecognizer } from '@/core/speech/expoSpeechRecognizer';
import { useSessionStore } from '@/core/session/sessionStore';
import { newOperationId } from '@/core/ids/operationId';
import { createSupabaseClient, type TypedSupabaseClient } from '@/core/network/supabaseClient';
import { createInstallationIdStore } from '@/core/security/installation';
import { createKeyValueSlot } from '@/core/storage/keyValueSlot';
import { createChunkedSecureStorage, type KeyValueStorage } from '@/core/storage/secureStorage';
import { pickCsvFile } from '@/core/files/csvFileSource';
import { readFileBytes, receiptPhotoPicker } from '@/core/files/receiptPhotoPicker';
import { fileSharer } from '@/core/sharing/fileSharer';
import { receiptSharer } from '@/core/sharing/receiptSharer';
import { createInvoiceCounterStore } from '@/core/storage/invoiceCounterStore';
import type { MoreViewModelDeps } from '@/features/account';
import {
  type BillingViewModelDeps,
  BillingRepositoryImpl,
  CreateSale,
  CreateSaleReturn,
  type CustomerFinder,
  GetSale,
  type OfflineSales,
  type Sale,
  ListSales,
  type ProductFinder,
  type ReceiptViewModelDeps,
  type SalesHistoryViewModelDeps,
  ShareReceipt,
  SupabaseBillingDataSource,
  VoidSale,
} from '@/features/billing';
import {
  type AuthRepository,
  AuthRepositoryImpl,
  RequestOtp,
  SignOut,
  SupabaseAuthDataSource,
  VerifyOtp,
} from '@/features/authentication';
import {
  ArchiveCategory,
  ArchiveProduct,
  CatalogueRepositoryImpl,
  GetProduct,
  LoadCatalogueReference,
  SaveCategory,
  SaveProduct,
  SearchProducts,
  AddProductAlias,
  SupabaseCatalogueDataSource,
} from '@/features/catalogue';
import {
  AppInfoDataSource,
  type DiagnosticsViewModelDeps,
  DiagnosticsRepositoryImpl,
  GetDiagnostics,
  SupabaseHealthDataSource,
} from '@/features/diagnostics';
import {
  AcceptInvitation,
  ActivateShop,
  CreateShop,
  DeviceRepositoryImpl,
  GetShopEntitlements,
  GetShopSettings,
  LoadMyContext,
  RestoreSession,
  ShopRepositoryImpl,
  SupabaseShopDataSource,
  UpdateShopSettings,
} from '@/features/shops';
import {
  CommitImport,
  FixImportRow,
  GetImportJob,
  ImportRepositoryImpl,
  ListProblemRows,
  PreviewCsvImport,
  SkipImportRow,
  SupabaseImportDataSource,
} from '@/features/imports';
import {
  type ExpenseFormViewModelDeps,
  ExpenseRepositoryImpl,
  type ExpensesViewModelDeps,
  GetExpensePhotoUrl,
  ListExpenses,
  RecordExpense,
  SupabaseExpenseDataSource,
  VoidExpense,
} from '@/features/expenses';
import {
  GetLatestOnboarding,
  type OnboardingRequestViewModelDeps,
  OnboardingRepositoryImpl,
  type OnboardingStatusViewModelDeps,
  RequestOnboarding,
  SupabaseOnboardingDataSource,
} from '@/features/onboarding';
import {
  type AnnouncementsViewModelDeps,
  CreateTicket,
  GetAnnouncements,
  GetTicketThread,
  ListTickets,
  ReplyToTicket,
  SupabaseSupportDataSource,
  SupportRepositoryImpl,
  type SupportViewModelDeps,
} from '@/features/support';
import {
  CloseDay,
  type DayCloseViewModelDeps,
  ExportSalesReport,
  GetDashboard,
  GetDayClose,
  GetSalesReport,
  type ReportsViewModelDeps,
  ReportsRepositoryImpl,
  SupabaseReportsDataSource,
} from '@/features/reports';
import {
  AdjustStock,
  CheckStockDrift,
  GetStockMovements,
  InventoryRepositoryImpl,
  ListStock,
  type StockCountViewModelDeps,
  type StockItemViewModelDeps,
  type StockViewModelDeps,
  SubmitStockCount,
  SupabaseInventoryDataSource,
} from '@/features/inventory';
import {
  GetSupplierLedger,
  ListSuppliers,
  type PurchaseFormViewModelDeps,
  PurchaseRepositoryImpl,
  ReceivePurchase,
  RecordSupplierPayment,
  SaveSupplier,
  SupabasePurchaseDataSource,
  type SupplierDetailViewModelDeps,
  type SupplierFormViewModelDeps,
  type SuppliersViewModelDeps,
} from '@/features/purchases';
import {
  AdjustBalance,
  type CustomerFormViewModelDeps,
  type CustomerLedgerViewModelDeps,
  CustomerRepositoryImpl,
  GetCustomerLedger,
  ListCustomers,
  RecordRepayment,
  SaveCustomer,
  SupabaseCustomerDataSource,
  type UdhaarListViewModelDeps,
} from '@/features/customers';
import { InviteMember, LoadStaff, StaffRepositoryImpl, SupabaseStaffDataSource } from '@/features/staff';
import { DraftFromSpeech, LearnAlias, type VoiceBillingViewModelDeps } from '@/features/voice';
import {
  GetSyncQueue,
  PullChanges,
  PushOutbox,
  publishSyncState,
  RetryOperation,
  SqliteSyncStore,
  SupabaseSyncDataSource,
  SyncService,
  type SyncStatusViewModelDeps,
} from '@/features/sync';
import type { StaffViewModelDeps } from '@/features/staff';

/**
 * Composition root (ADR-006): builds data sources → repositories → use cases once and hands
 * typed groups to routes. Tests build their own fakes and pass them to screens directly.
 */
export interface AppFeatures {
  auth: { repository: AuthRepository; requestOtp: RequestOtp; verifyOtp: VerifyOtp; signOut: SignOut };
  shops: {
    loadContext: LoadMyContext;
    activateShop: ActivateShop;
    acceptInvitation: AcceptInvitation;
    createShop: CreateShop;
    restoreSession: RestoreSession;
    getSettings: GetShopSettings;
    updateSettings: UpdateShopSettings;
    getEntitlements: GetShopEntitlements;
    newOperationId: () => string;
  };
  staff: StaffViewModelDeps;
  account: MoreViewModelDeps;
  catalogue: {
    searchProducts: SearchProducts;
    getProduct: GetProduct;
    saveProduct: SaveProduct;
    archiveProduct: ArchiveProduct;
    loadReference: LoadCatalogueReference;
    saveCategory: SaveCategory;
    archiveCategory: ArchiveCategory;
    newId: () => string;
  };
  imports: {
    fileSource: { pick: typeof pickCsvFile };
    previewImport: PreviewCsvImport;
    listProblemRows: ListProblemRows;
    fixRow: FixImportRow;
    skipRow: SkipImportRow;
    commitImport: CommitImport;
    getImportJob: GetImportJob;
    newId: () => string;
  };
  billing: BillingViewModelDeps & ReceiptViewModelDeps & SalesHistoryViewModelDeps;
  reports: ReportsViewModelDeps & DayCloseViewModelDeps;
  expenses: ExpensesViewModelDeps & ExpenseFormViewModelDeps;
  inventory: StockViewModelDeps & StockItemViewModelDeps & StockCountViewModelDeps;
  purchases: SuppliersViewModelDeps &
    SupplierFormViewModelDeps &
    SupplierDetailViewModelDeps &
    PurchaseFormViewModelDeps;
  customers: UdhaarListViewModelDeps & CustomerFormViewModelDeps & CustomerLedgerViewModelDeps;
  sync: SyncStatusViewModelDeps & { service: SyncService };
  voice: VoiceBillingViewModelDeps<ProductDto> & { isEnabled(shopId: string): Promise<boolean> };
  onboarding: OnboardingStatusViewModelDeps & OnboardingRequestViewModelDeps;
  support: SupportViewModelDeps & AnnouncementsViewModelDeps;
}

export interface Container {
  env: AppEnv;
  supabase: TypedSupabaseClient | null;
  diagnostics: DiagnosticsViewModelDeps;
  /** Null when no backend is configured: the app shows diagnostics instead of sign-in. */
  features: AppFeatures | null;
}

export function createContainer(
  env: AppEnv,
  storage: KeyValueStorage = createChunkedSecureStorage(),
): Container {
  const supabase = env.backend ? createSupabaseClient(env.backend, storage) : null;

  const diagnosticsRepository = new DiagnosticsRepositoryImpl(
    new AppInfoDataSource(env),
    env.backend ? new SupabaseHealthDataSource(env.backend) : null,
  );

  return {
    env,
    supabase,
    diagnostics: { getDiagnostics: new GetDiagnostics(diagnosticsRepository) },
    features: supabase ? createFeatures(supabase, storage) : null,
  };
}

function createFeatures(supabase: TypedSupabaseClient, storage: KeyValueStorage): AppFeatures {
  const authRepository = new AuthRepositoryImpl(new SupabaseAuthDataSource(supabase));
  const shopRemote = new SupabaseShopDataSource(supabase);
  const shopRepository = new ShopRepositoryImpl(shopRemote);
  const deviceRepository = new DeviceRepositoryImpl(
    shopRemote,
    createInstallationIdStore(storage),
    Platform.OS === 'ios' ? 'ios' : 'android',
    Constants.expoConfig?.version ?? '0.0.0',
  );
  const lastShop = createKeyValueSlot(storage, 'ds.last_shop_id');
  const sessionSnapshot = createKeyValueSlot(storage, 'ds.session_snapshot');
  const loadContext = new LoadMyContext(shopRepository);
  const activateShop = new ActivateShop(deviceRepository, lastShop);
  const staffRepository = new StaffRepositoryImpl(new SupabaseStaffDataSource(supabase));
  const signOut = new SignOut(authRepository, async () => {
    await lastShop.clear();
    await sessionSnapshot.clear();
  });
  const catalogueRepository = new CatalogueRepositoryImpl(new SupabaseCatalogueDataSource(supabase));
  const importRepository = new ImportRepositoryImpl(new SupabaseImportDataSource(supabase));
  const billingRepository = new BillingRepositoryImpl(new SupabaseBillingDataSource(supabase));
  const reportsRepository = new ReportsRepositoryImpl(new SupabaseReportsDataSource(supabase));
  const expenseRepository = new ExpenseRepositoryImpl(new SupabaseExpenseDataSource(supabase, readFileBytes));
  const onboardingRepository = new OnboardingRepositoryImpl(
    new SupabaseOnboardingDataSource(supabase, readFileBytes),
  );
  const supportRepository = new SupportRepositoryImpl(new SupabaseSupportDataSource(supabase));
  const getSettings = new GetShopSettings(shopRepository);
  const getEntitlements = new GetShopEntitlements(shopRepository);
  const searchProducts = new SearchProducts(catalogueRepository);
  const loadReference = new LoadCatalogueReference(catalogueRepository);
  const inventoryRepository = new InventoryRepositoryImpl(new SupabaseInventoryDataSource(supabase));
  const purchaseRepository = new PurchaseRepositoryImpl(new SupabasePurchaseDataSource(supabase));
  const listStock = new ListStock(inventoryRepository);
  const listSuppliers = new ListSuppliers(purchaseRepository);
  const addProductAlias = new AddProductAlias(catalogueRepository);

  // ---- offline (Phase 09): local SQLite, outbox, sync service ------------------------------------
  const syncStore = new SqliteSyncStore(openAppDatabase());
  const syncRemote = new SupabaseSyncDataSource(supabase);
  const clock = { now: () => new Date() };
  const isOnline = () => useConnectivityStore.getState().isOnline;
  const syncService = new SyncService({
    push: new PushOutbox(syncStore, syncRemote, clock),
    pull: new PullChanges(syncStore, syncRemote),
    store: syncStore,
    isOnline,
    publish: publishSyncState,
  });
  const currentUser = () => useSessionStore.getState().userId ?? 'unknown';
  const unreachable = (e: unknown) => {
    const code = (e as { code?: string } | null)?.code;
    return code === 'NETWORK_OFFLINE' || code === 'NETWORK_TIMEOUT';
  };
  /** Last good answer, kept on the phone: used when there is no connection. */
  const cached = async <T>(key: string, fetch: () => Promise<T>): Promise<T> => {
    const saved = syncStore.getValue<T>(key);
    if (!isOnline() && saved !== null) return saved;
    try {
      const value = await fetch();
      syncStore.setValue(key, value);
      return value;
    } catch (error) {
      if (saved !== null && unreachable(error)) return saved;
      throw error;
    }
  };
  const offlineSales: OfflineSales = {
    isOnline,
    hasWaitingSales: (shopId) =>
      syncStore
        .open(shopId, currentUser())
        .some((e) => e.operation === 'create_sale' && e.status === 'pending'),
    queue: async (command, receipt) => {
      syncStore.queueSale(
        {
          id: command.clientOperationId,
          shopId: command.shopId,
          userId: currentUser(),
          operation: 'create_sale',
          payload: command,
          label: receipt.invoiceNumber,
        },
        command.saleId,
        receipt,
        clock.now().toISOString(),
      );
      syncService.nudge();
    },
    localSale: (saleId) => {
      const local = syncStore.localSale(saleId);
      if (!local) return null;
      return {
        ...(local.receipt as Sale),
        local: { state: local.status === 'pending' ? 'pending' : 'quarantined', code: local.error },
      };
    },
  };
  const customerRepository = new CustomerRepositoryImpl(new SupabaseCustomerDataSource(supabase));
  const listCustomers = new ListCustomers(customerRepository);
  const saveCustomer = new SaveCustomer(customerRepository);
  // Billing sees customers only through this port (udhaar picker and quick add).
  const queueCustomer = (input: { id: string; shopId: string; name: string; phoneText: string }) => {
    const name = input.name.trim();
    const phone = input.phoneText.trim() ? normalizeIndianPhone(input.phoneText) : null;
    if (!name || (input.phoneText.trim() && !phone)) {
      // Same rules as SaveCustomer, checked before anything is queued.
      return saveCustomer.execute(input);
    }
    const now = clock.now().toISOString();
    const customer = {
      id: input.id,
      name,
      phone,
      note: null,
      creditLimitPaise: null,
      balancePaise: 0,
      udhaarSince: null,
      lastActivityAt: null,
      archivedAt: null,
      createdAt: now,
    };
    syncStore.queueCustomer(
      {
        id: input.id,
        shopId: input.shopId,
        userId: currentUser(),
        operation: 'create_customer',
        payload: { id: input.id, shopId: input.shopId, name, ...(phone ? { phone } : {}) },
        label: name,
      },
      customer,
      now,
    );
    syncService.nudge();
    return Promise.resolve(customer);
  };
  const customerFinder: CustomerFinder = {
    search: async (shopId, text) => {
      if (!isOnline()) return syncStore.searchCustomers(shopId, text, 8);
      try {
        return (
          await listCustomers.execute(shopId, { query: text, sort: 'name', udhaarOnly: false })
        ).rows.slice(0, 8);
      } catch (error) {
        if (unreachable(error)) return syncStore.searchCustomers(shopId, text, 8);
        throw error;
      }
    },
    quickAdd: async (input) => {
      if (!isOnline()) return queueCustomer(input);
      try {
        return await saveCustomer.execute(input);
      } catch (error) {
        if (unreachable(error)) return queueCustomer(input);
        throw error;
      }
    },
  };
  // Billing and purchases see the catalogue only through this port (features stay independent).
  // Offline (or no answer from the server), billing searches the phone's copy of the catalogue.
  const productFinder: ProductFinder = {
    search: async (shopId, text) => {
      if (!isOnline()) return syncStore.searchProducts(shopId, text, 10);
      try {
        return (await searchProducts.execute(shopId, { query: text, categoryId: null, offset: 0, limit: 10 }))
          .items;
      } catch (error) {
        if (unreachable(error)) return syncStore.searchProducts(shopId, text, 10);
        throw error;
      }
    },
    byBarcode: async (shopId, code) => {
      if (!isOnline()) return syncStore.productByBarcode(shopId, code);
      try {
        return (
          (
            await searchProducts.execute(shopId, { query: code, categoryId: null, offset: 0, limit: 5 })
          ).items.find((p) => p.isActive && p.barcodes.includes(code)) ?? null
        );
      } catch (error) {
        if (unreachable(error)) return syncStore.productByBarcode(shopId, code);
        throw error;
      }
    },
    reference: (shopId) => cached(`reference:${shopId}`, () => loadReference.execute(shopId)),
  };

  return {
    auth: {
      repository: authRepository,
      requestOtp: new RequestOtp(authRepository),
      verifyOtp: new VerifyOtp(authRepository),
      signOut,
    },
    shops: {
      loadContext,
      activateShop,
      acceptInvitation: new AcceptInvitation(shopRepository),
      createShop: new CreateShop(shopRepository, newOperationId),
      restoreSession: new RestoreSession(loadContext, activateShop, lastShop, {
        load: () => sessionSnapshot.get(),
        save: (json) => sessionSnapshot.set(json),
        clear: () => sessionSnapshot.clear(),
      }),
      getSettings,
      updateSettings: new UpdateShopSettings(shopRepository),
      getEntitlements,
      newOperationId,
    },
    staff: {
      loadStaff: new LoadStaff(staffRepository),
      inviteMember: new InviteMember(staffRepository),
      staffRepository,
    },
    account: { signOut, unsentCount: (userId) => syncStore.unsentCount(userId) },
    catalogue: {
      searchProducts,
      getProduct: new GetProduct(catalogueRepository),
      saveProduct: new SaveProduct(catalogueRepository, newOperationId),
      archiveProduct: new ArchiveProduct(catalogueRepository),
      loadReference,
      saveCategory: new SaveCategory(catalogueRepository),
      archiveCategory: new ArchiveCategory(catalogueRepository),
      newId: newOperationId,
    },
    imports: {
      fileSource: { pick: pickCsvFile },
      previewImport: new PreviewCsvImport(importRepository, newOperationId),
      listProblemRows: new ListProblemRows(importRepository),
      fixRow: new FixImportRow(importRepository),
      skipRow: new SkipImportRow(importRepository),
      commitImport: new CommitImport(importRepository),
      getImportJob: new GetImportJob(importRepository),
      newId: newOperationId,
    },
    billing: {
      getSettings: {
        execute: (shopId: string) => cached(`shopSettings:${shopId}`, () => getSettings.execute(shopId)),
      },
      createSale: new CreateSale(billingRepository, createInvoiceCounterStore(storage), offlineSales),
      products: productFinder,
      customers: customerFinder,
      getSale: new GetSale(billingRepository, offlineSales),
      listSales: new ListSales(billingRepository),
      voidSale: new VoidSale(billingRepository),
      createReturn: new CreateSaleReturn(billingRepository),
      shareReceipt: new ShareReceipt(receiptSharer),
      newId: newOperationId,
    },
    reports: {
      getDashboard: new GetDashboard(reportsRepository),
      getSalesReport: new GetSalesReport(reportsRepository),
      exportReport: new ExportSalesReport(reportsRepository, fileSharer),
      getDayClose: new GetDayClose(reportsRepository),
      closeDay: new CloseDay(reportsRepository),
      newId: newOperationId,
    },
    expenses: {
      listExpenses: new ListExpenses(expenseRepository),
      voidExpense: new VoidExpense(expenseRepository),
      photoUrl: new GetExpensePhotoUrl(expenseRepository),
      openUrl: (url) => Linking.openURL(url),
      recordExpense: new RecordExpense(expenseRepository),
      photos: receiptPhotoPicker,
      newId: newOperationId,
    },
    inventory: {
      listStock,
      checkDrift: new CheckStockDrift(inventoryRepository),
      getMovements: new GetStockMovements(inventoryRepository),
      adjustStock: new AdjustStock(inventoryRepository),
      submitCount: new SubmitStockCount(inventoryRepository),
      newId: newOperationId,
    },
    purchases: {
      listSuppliers,
      saveSupplier: new SaveSupplier(purchaseRepository),
      getLedger: new GetSupplierLedger(purchaseRepository),
      paySupplier: new RecordSupplierPayment(purchaseRepository),
      receivePurchase: new ReceivePurchase(purchaseRepository),
      products: productFinder,
      newId: newOperationId,
    },
    customers: {
      listCustomers,
      saveCustomer,
      getLedger: new GetCustomerLedger(customerRepository),
      recordRepayment: new RecordRepayment(customerRepository, {
        isOnline,
        queue: async (command, label) => {
          syncStore.enqueue(
            {
              id: command.clientOperationId,
              shopId: command.shopId,
              userId: currentUser(),
              operation: 'record_customer_repayment',
              payload: command,
              label,
            },
            clock.now().toISOString(),
          );
          syncService.nudge();
        },
      }),
      adjustBalance: new AdjustBalance(customerRepository),
      getUpiVpa: async (shopId) => (await getSettings.execute(shopId)).upiVpa,
      openUrl: (url) => Linking.openURL(url),
      newId: newOperationId,
    },
    voice: {
      recognizer: createExpoSpeechRecognizer(),
      draftFromSpeech: new DraftFromSpeech<ProductDto>(
        {
          // Voice matches against the whole catalogue: the phone's copy, or the server's when there is none yet.
          load: async (shopId) => {
            const cachedItems = syncStore.allProducts(shopId);
            const products = cachedItems.length
              ? cachedItems
              : (await searchProducts.execute(shopId, { query: '', categoryId: null, offset: 0, limit: 500 }))
                  .items;
            const units = new Map(
              (await productFinder.reference(shopId)).units.map((u) => [u.code, u.allowsFraction]),
            );
            return { products, allowsFraction: (code) => units.get(code) ?? true };
          },
        },
        newOperationId,
      ),
      learnAlias: new LearnAlias<ProductDto>({
        learn: (shopId, productId, alias) => addProductAlias.execute(shopId, productId, alias),
      }),
      isEnabled: async (shopId) =>
        (await cached(`entitlements:${shopId}`, () => getEntitlements.execute(shopId))).entitlements[
          'voice.billing'
        ] === true,
    },
    onboarding: {
      getLatestOnboarding: new GetLatestOnboarding(onboardingRepository),
      isEnabled: async (shopId) =>
        (await cached(`entitlements:${shopId}`, () => getEntitlements.execute(shopId))).entitlements[
          'onboarding.managed'
        ] === true,
      requestOnboarding: new RequestOnboarding(onboardingRepository),
      photos: receiptPhotoPicker,
      newId: newOperationId,
    },
    support: {
      listTickets: new ListTickets(supportRepository),
      getThread: new GetTicketThread(supportRepository),
      createTicket: new CreateTicket(supportRepository),
      replyToTicket: new ReplyToTicket(supportRepository),
      getAnnouncements: new GetAnnouncements(supportRepository),
      newId: newOperationId,
    },
    sync: {
      service: syncService,
      getQueue: new GetSyncQueue(syncStore),
      retry: new RetryOperation(syncStore, syncService, clock),
      trigger: syncService,
    },
  };
}
