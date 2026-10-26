import { translateError } from '@/core/errors/translateError';
import type {
  AdjustmentCommand,
  CustomerQuery,
  RepaymentCommand,
  SaveCustomerCommand,
} from '../../domain/entities/Customers';
import type { CustomerRepository } from '../../domain/repositories/CustomerRepository';
import type { SupabaseCustomerDataSource } from '../datasources/remote/SupabaseCustomerDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class CustomerRepositoryImpl implements CustomerRepository {
  constructor(private readonly remote: SupabaseCustomerDataSource) {}

  list = (shopId: string, query: CustomerQuery) => translated(() => this.remote.list(shopId, query));
  save = (command: SaveCustomerCommand) => translated(() => this.remote.save(command));
  ledger = (shopId: string, customerId: string) => translated(() => this.remote.ledger(shopId, customerId));
  recordRepayment = (command: RepaymentCommand) => translated(() => this.remote.recordRepayment(command));
  adjustBalance = (command: AdjustmentCommand) => translated(() => this.remote.adjustBalance(command));
}
