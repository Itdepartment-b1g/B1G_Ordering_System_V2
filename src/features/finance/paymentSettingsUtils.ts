import type { BankAccount, CompanyPaymentSettings } from '@/types/database.types';

function filterEnabledBanks(accounts: BankAccount[] | null | undefined): BankAccount[] {
  return (accounts ?? []).filter(
    (bank) => bank.enabled && bank.name?.trim() && bank.account_number?.trim()
  );
}

/** Enabled bank accounts when bank transfer is turned on (orders, cash deposits). */
export function getEnabledBankAccounts(
  settings: Pick<CompanyPaymentSettings, 'bank_accounts' | 'bank_transfer_enabled'> | null | undefined
): BankAccount[] {
  if (!settings?.bank_transfer_enabled) return [];
  return filterEnabledBanks(settings.bank_accounts);
}

/** Banks to print on Delivery Receipt — any enabled account, no payment-method toggle required. */
export function getDrBankAccounts(
  payment: Pick<CompanyPaymentSettings, 'bank_accounts'> | null | undefined
): BankAccount[] {
  return filterEnabledBanks(payment?.bank_accounts);
}
