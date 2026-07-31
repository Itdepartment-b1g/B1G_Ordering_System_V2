import type { BankAccount, KeyAccountPaymentSettings } from '@/types/database.types';

export type KeyAccountPaymentMethod = 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE';

export const KEY_ACCOUNT_PAYMENT_METHOD_LABELS: Record<KeyAccountPaymentMethod, string> = {
  GCASH: 'GCash',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
};

const DEFAULT_PAYMENT_FLAGS = {
  cash_enabled: true,
  cheque_enabled: true,
  gcash_enabled: false,
  bank_transfer_enabled: false,
} as const;

function resolvePaymentFlags(settings: KeyAccountPaymentSettings | null | undefined) {
  if (!settings) return DEFAULT_PAYMENT_FLAGS;
  return {
    cash_enabled: settings.cash_enabled,
    cheque_enabled: settings.cheque_enabled,
    gcash_enabled: settings.gcash_enabled,
    bank_transfer_enabled: settings.bank_transfer_enabled,
  };
}

export function getKeyAccountEnabledBankAccounts(
  settings: KeyAccountPaymentSettings | null | undefined
): BankAccount[] {
  if (!settings?.bank_transfer_enabled) return [];
  return (settings.bank_accounts ?? []).filter(
    (bank) => bank.enabled !== false && bank.name?.trim() && bank.account_number?.trim()
  );
}

export function getKeyAccountPaymentMethods(
  settings: KeyAccountPaymentSettings | null | undefined
): KeyAccountPaymentMethod[] {
  const flags = resolvePaymentFlags(settings);
  const methods: KeyAccountPaymentMethod[] = [];

  if (flags.gcash_enabled) methods.push('GCASH');
  if (flags.bank_transfer_enabled && getKeyAccountEnabledBankAccounts(settings).length > 0) {
    methods.push('BANK_TRANSFER');
  }
  if (flags.cash_enabled) methods.push('CASH');
  if (flags.cheque_enabled) methods.push('CHEQUE');

  return methods;
}
