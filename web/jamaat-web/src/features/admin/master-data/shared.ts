export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };
export type SortDir = 'Asc' | 'Desc';

export const AccountTypeLabel: Record<number, string> = {
  1: 'Asset', 2: 'Liability', 3: 'Income', 4: 'Expense', 5: 'Equity', 6: 'Fund',
};

export const NumberingScopeLabel: Record<number, string> = {
  1: 'Receipt', 2: 'Voucher', 3: 'Journal',
};

export const PaymentModeLabel: Record<number, string> = {
  1: 'Cash', 2: 'Cheque', 4: 'Bank Transfer', 8: 'Card', 16: 'Online', 32: 'UPI',
};

export function paymentModeFlagsToLabels(flags: number): string[] {
  return Object.entries(PaymentModeLabel)
    .filter(([v]) => (flags & Number(v)) !== 0)
    .map(([, l]) => l);
}
