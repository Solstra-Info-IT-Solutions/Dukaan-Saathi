import type {
  AdjustmentCommand,
  Customer,
  CustomerLedger,
  CustomerList,
  CustomerQuery,
  RepaymentCommand,
  SaveCustomerCommand,
} from '../entities/Customers';

export interface CustomerRepository {
  list(shopId: string, query: CustomerQuery): Promise<CustomerList>;
  /** Creates (client id) or edits a customer; safe to repeat. */
  save(command: SaveCustomerCommand): Promise<Customer>;
  /** The customer and their entries, newest first. */
  ledger(shopId: string, customerId: string): Promise<CustomerLedger>;
  /** Safe to repeat with the same command. */
  recordRepayment(command: RepaymentCommand): Promise<{ balancePaise: number }>;
  /** Safe to repeat with the same command (owner only). */
  adjustBalance(command: AdjustmentCommand): Promise<{ balancePaise: number }>;
}
