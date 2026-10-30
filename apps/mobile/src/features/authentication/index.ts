// Public API of the authentication feature.
export type { AuthSession, OtpDestination } from './domain/entities/AuthSession';
export type { AuthRepository } from './domain/repositories/AuthRepository';
export {
  ChangePassword,
  MIN_PASSWORD_LENGTH,
  RegisterAccount,
  RequestOtp,
  RequestPasswordReset,
  ResetPassword,
  SignInWithPassword,
  SignOut,
  VerifyOtp,
} from './domain/usecases/authUseCases';
export { AuthRepositoryImpl } from './data/repositories/AuthRepositoryImpl';
export { SupabaseAuthDataSource } from './data/datasources/remote/SupabaseAuthDataSource';
export { LoginScreen } from './presentation/screens/LoginScreen';
export { OtpScreen } from './presentation/screens/OtpScreen';
export {
  ForgotPasswordScreen,
  PasswordLoginScreen,
  RegisterScreen,
} from './presentation/screens/PasswordAuthScreens';
export type {
  ForgotPasswordViewModelDeps,
  PasswordLoginViewModelDeps,
  RegisterViewModelDeps,
} from './presentation/viewmodels/usePasswordAuthViewModels';
export { authErrorKey } from './presentation/viewmodels/useLoginViewModel';
export type { LoginViewModelDeps } from './presentation/viewmodels/useLoginViewModel';
export type { OtpViewModelDeps } from './presentation/viewmodels/useOtpViewModel';
