// Public API of the customers feature (customers, udhaar ledger, repayments, adjustments, reminders).
export type { CustomerRepository } from './domain/repositories/CustomerRepository';
export type { Customer } from './domain/entities/Customers';
export {
  AdjustBalance,
  GetCustomerLedger,
  ListCustomers,
  RecordRepayment,
  SaveCustomer,
} from './domain/usecases/customerUseCases';
export { CustomerRepositoryImpl } from './data/repositories/CustomerRepositoryImpl';
export { SupabaseCustomerDataSource } from './data/datasources/remote/SupabaseCustomerDataSource';
export { UdhaarListScreen } from './presentation/screens/UdhaarListScreen';
export { CustomerFormScreen } from './presentation/screens/CustomerFormScreen';
export { CustomerLedgerScreen } from './presentation/screens/CustomerLedgerScreen';
export type {
  CustomerFormViewModelDeps,
  CustomerLedgerViewModelDeps,
  UdhaarListViewModelDeps,
} from './presentation/viewmodels/useCustomersViewModel';
