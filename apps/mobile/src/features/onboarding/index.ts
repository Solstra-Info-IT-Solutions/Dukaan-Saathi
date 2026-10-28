// Public API of the managed onboarding feature (Phase 11).
export type { OnboardingRepository } from './domain/repositories/OnboardingRepository';
export type { OnboardingPhotoPicker, OnboardingRequest } from './domain/entities/Onboarding';
export {
  GetLatestOnboarding,
  OnboardingInputError,
  RequestOnboarding,
  toIndianMobile,
} from './domain/usecases/onboardingUseCases';
export { OnboardingRepositoryImpl } from './data/repositories/OnboardingRepositoryImpl';
export { SupabaseOnboardingDataSource } from './data/datasources/remote/SupabaseOnboardingDataSource';
export { OnboardingRequestScreen } from './presentation/screens/OnboardingRequestScreen';
export { OnboardingStatusCard } from './presentation/components/OnboardingStatusCard';
export { onboardingKeys } from './presentation/viewmodels/useOnboardingStatusViewModel';
export type { OnboardingStatusViewModelDeps } from './presentation/viewmodels/useOnboardingStatusViewModel';
export type { OnboardingRequestViewModelDeps } from './presentation/viewmodels/useOnboardingRequestViewModel';
