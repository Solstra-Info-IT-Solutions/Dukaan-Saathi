import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import type { AppEnv } from '@/core/config/env';
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
  const loadContext = new LoadMyContext(shopRepository);
  const activateShop = new ActivateShop(deviceRepository, lastShop);
  const staffRepository = new StaffRepositoryImpl(new SupabaseStaffDataSource(supabase));
  const signOut = new SignOut(authRepository, () => lastShop.clear());
  const catalogueRepository = new CatalogueRepositoryImpl(new SupabaseCatalogueDataSource(supabase));
  const importRepository = new ImportRepositoryImpl(new SupabaseImportDataSource(supabase));
  const billingRepository = new BillingRepositoryImpl(new SupabaseBillingDataSource(supabase));
  const reportsRepository = new ReportsRepositoryImpl(new SupabaseReportsDataSource(supabase));
  const expenseRepository = new ExpenseRepositoryImpl(new SupabaseExpenseDataSource(supabase, readFileBytes));
  const getSettings = new GetShopSettings(shopRepository);
  const searchProducts = new SearchProducts(catalogueRepository);
  const loadReference = new LoadCatalogueReference(catalogueRepository);
  const inventoryRepository = new InventoryRepositoryImpl(new SupabaseInventoryDataSource(supabase));
  const purchaseRepository = new PurchaseRepositoryImpl(new SupabasePurchaseDataSource(supabase));
  const listStock = new ListStock(inventoryRepository);
  const listSuppliers = new ListSuppliers(purchaseRepository);
  const customerRepository = new CustomerRepositoryImpl(new SupabaseCustomerDataSource(supabase));
  const listCustomers = new ListCustomers(customerRepository);
  const saveCustomer = new SaveCustomer(customerRepository);
  // Billing sees customers only through this port (udhaar picker and quick add).
  const customerFinder: CustomerFinder = {
    search: async (shopId, text) =>
      (await listCustomers.execute(shopId, { query: text, sort: 'name', udhaarOnly: false })).rows.slice(
        0,
        8,
      ),
    quickAdd: (input) => saveCustomer.execute(input),
  };
  // Billing and purchases see the catalogue only through this port (features stay independent).
  const productFinder: ProductFinder = {
    search: async (shopId, text) =>
      (await searchProducts.execute(shopId, { query: text, categoryId: null, offset: 0, limit: 10 })).items,
    byBarcode: async (shopId, code) =>
      (
        await searchProducts.execute(shopId, { query: code, categoryId: null, offset: 0, limit: 5 })
      ).items.find((p) => p.isActive && p.barcodes.includes(code)) ?? null,
    reference: (shopId) => loadReference.execute(shopId),
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
      restoreSession: new RestoreSession(loadContext, activateShop, lastShop),
      getSettings,
      updateSettings: new UpdateShopSettings(shopRepository),
      getEntitlements: new GetShopEntitlements(shopRepository),
      newOperationId,
    },
    staff: {
      loadStaff: new LoadStaff(staffRepository),
      inviteMember: new InviteMember(staffRepository),
      staffRepository,
    },
    account: { signOut },
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
      newId: newOperationId,
    },
    billing: {
      getSettings,
      createSale: new CreateSale(billingRepository, createInvoiceCounterStore(storage)),
      products: productFinder,
      customers: customerFinder,
      getSale: new GetSale(billingRepository),
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
      recordRepayment: new RecordRepayment(customerRepository),
      adjustBalance: new AdjustBalance(customerRepository),
      getUpiVpa: async (shopId) => (await getSettings.execute(shopId)).upiVpa,
      openUrl: (url) => Linking.openURL(url),
      newId: newOperationId,
    },
  };
}
