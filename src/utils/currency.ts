export const CURRENCY_CODE = 'RWF';
export const CURRENCY_SYMBOL = 'FRw';

export function formatCurrency(amount: number | string | null | undefined, decimals = 2): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  if (isNaN(num)) return `${CURRENCY_SYMBOL} 0`;
  return `${CURRENCY_SYMBOL} ${num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
