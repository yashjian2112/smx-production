/**
 * Converts a number to words using Indian numbering system (lakhs, crores).
 * Used for generating "Amount Chargeable in Words" on invoices.
 */

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  return (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')).trim();
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
}

/**
 * Convert integer part to Indian words (uses lakhs, crores).
 */
function integerToIndianWords(n: number): string {
  if (n === 0) return 'Zero';
  if (n < 0)   return 'Minus ' + integerToIndianWords(-n);

  const parts: string[] = [];

  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  if (crore) parts.push(threeDigits(crore) + ' Crore');

  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');

  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  if (thousand) parts.push(twoDigits(thousand) + ' Thousand');

  if (n) parts.push(threeDigits(n));

  return parts.join(' ');
}

/**
 * Converts amount to Indian-style words.
 * @param amount  - The number (e.g. 134400.50)
 * @param currency - "INR" | "USD"
 */
export function amountToWords(amount: number, currency: 'INR' | 'USD' = 'INR'): string {
  const rupees = Math.floor(amount);
  const paise  = Math.round(Math.round(amount * 100) % 100);

  if (currency === 'USD') {
    const dollars = Math.floor(amount);
    const cents   = Math.round(Math.round(amount * 100) % 100);
    let result    = 'USD ' + integerToIndianWords(dollars) + (dollars === 1 ? ' Dollar' : ' Dollars');
    if (cents) result += ' and ' + twoDigits(cents) + ' Cents';
    return result + ' Only';
  }

  // INR path — Indian numbering
  let result = 'INR ' + integerToIndianWords(rupees) + ' Rupee' + (rupees !== 1 ? 's' : '');
  if (paise) result += ' and ' + twoDigits(paise) + ' Paise';
  return result + ' Only';
}
