// Public API of the authentication feature.
export type { AuthSession, OtpDestination } from './domain/entities/AuthSession';
export type { AuthRepository } from './domain/repositories/AuthRepository';
export { RequestOtp, SignOut, VerifyOtp } from './domain/usecases/authUseCases';
export { AuthRepositoryImpl } from './data/repositories/AuthRepositoryImpl';
export { SupabaseAuthDataSource } from './data/datasources/remote/SupabaseAuthDataSource';
export { LoginScreen } from './presentation/screens/LoginScreen';
export { OtpScreen } from './presentation/screens/OtpScreen';
export type { LoginViewModelDeps } from './presentation/viewmodels/useLoginViewModel';
export type { OtpViewModelDeps } from './presentation/viewmodels/useOtpViewModel';
