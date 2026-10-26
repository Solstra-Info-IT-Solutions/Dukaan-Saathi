import type {
  BalanceAdjustmentInput,
  CustomerDto,
  CustomerLedgerDto,
  CustomerLedgerEntryDto,
  CustomerListDto,
  CustomerSort,
  RepaymentInput,
  SaveCustomerInput,
} from '@ds/contracts';

// Contract shapes are already what the domain needs (validated by Zod in the data layer).
export type Customer = CustomerDto;
export type CustomerList = CustomerListDto;
export type CustomerLedger = CustomerLedgerDto;
export type CustomerLedgerEntry = CustomerLedgerEntryDto;
export type SaveCustomerCommand = SaveCustomerInput;
export type RepaymentCommand = RepaymentInput;
export type AdjustmentCommand = BalanceAdjustmentInput;
export type RepaymentMethod = RepaymentInput['method'];
export type { CustomerSort };

export interface CustomerQuery {
  query: string;
  sort: CustomerSort;
  udhaarOnly: boolean;
}
