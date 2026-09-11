export interface CurrencyOption {
  code: string;
  label: string;
}

/** Suggestions only — any 3-letter ISO code is accepted. */
export const COMMON_CURRENCIES: CurrencyOption[] = [
  { code: 'THB', label: 'บาทไทย (THB)' },
  { code: 'SGD', label: 'ดอลลาร์สิงคโปร์ (SGD)' },
  { code: 'JPY', label: 'เยนญี่ปุ่น (JPY)' },
  { code: 'KRW', label: 'วอนเกาหลี (KRW)' },
  { code: 'USD', label: 'ดอลลาร์สหรัฐ (USD)' },
  { code: 'EUR', label: 'ยูโร (EUR)' },
  { code: 'GBP', label: 'ปอนด์ (GBP)' },
  { code: 'CNY', label: 'หยวนจีน (CNY)' },
  { code: 'HKD', label: 'ดอลลาร์ฮ่องกง (HKD)' },
  { code: 'TWD', label: 'ดอลลาร์ไต้หวัน (TWD)' },
  { code: 'MYR', label: 'ริงกิตมาเลเซีย (MYR)' },
  { code: 'VND', label: 'ด่งเวียดนาม (VND)' },
  { code: 'AUD', label: 'ดอลลาร์ออสเตรเลีย (AUD)' },
  { code: 'IDR', label: 'รูเปียห์อินโดนีเซีย (IDR)' },
  { code: 'LAK', label: 'กีบลาว (LAK)' },
  { code: 'KHR', label: 'เรียลกัมพูชา (KHR)' },
];
