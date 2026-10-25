import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { AppEnv } from '@/core/config/env';
import { newOperationId } from '@/core/ids/operationId';
import { createSupabaseClient, type TypedSupabaseClient } from '@/core/network/supabaseClient';
import { createInstallationIdStore } from '@/core/security/installation';
import { createKeyValueSlot } from '@/core/storage/keyValueSlot';
import { createChunkedSecureStorage, type KeyValueStorage } from '@/core/storage/secureStorage';
import { pickCsvFile } from '@/core/files/csvFileSource';
import { receiptSharer } from '@/core/sharing/receiptSharer';
import { createInvoiceCounterStore } from '@/core/storage/invoiceCounterStore';
import type { MoreViewModelDeps } from '@/features/account';
import {
  type BillingViewModelDeps,
  BillingRepositoryImpl,
  CreateQuickSale,
  GetSale,
  type ReceiptViewModelDeps,
  ShareReceipt,
  SupabaseBillingDataSource,
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
  billing: BillingViewModelDeps & ReceiptViewModelDeps;
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
  const getSettings = new GetShopSettings(shopRepository);

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
      searchProducts: new SearchProducts(catalogueRepository),
      getProduct: new GetProduct(catalogueRepository),
      saveProduct: new SaveProduct(catalogueRepository, newOperationId),
      archiveProduct: new ArchiveProduct(catalogueRepository),
      loadReference: new LoadCatalogueReference(catalogueRepository),
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
      createSale: new CreateQuickSale(billingRepository, createInvoiceCounterStore(storage)),
      getSale: new GetSale(billingRepository),
      shareReceipt: new ShareReceipt(receiptSharer),
      newId: newOperationId,
    },
  };
}
