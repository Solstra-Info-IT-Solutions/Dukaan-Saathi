// Public API of the shops feature.
export type { Membership, MyContext, ShopActivation } from './domain/entities/Shop';
export type {
  DeviceRepository,
  LastShopPreference,
  SessionSnapshotStore,
  ShopRepository,
} from './domain/repositories/ShopRepository';
export {
  AcceptInvitation,
  ActivateShop,
  CreateShop,
  GetShopEntitlements,
  GetShopFlags,
  GetShopSettings,
  LoadMyContext,
  RestoreSession,
  UpdateShopSettings,
  pickInitialShop,
} from './domain/usecases/shopUseCases';
export { DeviceRepositoryImpl, ShopRepositoryImpl } from './data/repositories/ShopRepositoryImpl';
export { SupabaseShopDataSource } from './data/datasources/remote/SupabaseShopDataSource';
export { SelectShopScreen } from './presentation/screens/SelectShopScreen';
export { CreateShopScreen } from './presentation/screens/CreateShopScreen';
export { ShopHomeScreen } from './presentation/screens/ShopHomeScreen';
export type { HomeShortcut } from './presentation/screens/ShopHomeScreen';
export { ShopSettingsScreen } from './presentation/screens/ShopSettingsScreen';
export type { SelectShopViewModelDeps } from './presentation/viewmodels/useSelectShopViewModel';
export type { CreateShopViewModelDeps } from './presentation/viewmodels/useCreateShopViewModel';
export type { ShopHomeViewModelDeps } from './presentation/viewmodels/useShopHomeViewModel';
export type { ShopSettingsViewModelDeps } from './presentation/viewmodels/useShopSettingsViewModel';
