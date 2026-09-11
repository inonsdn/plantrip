/**
 * The demo trip used by both `supabase/seed/dev_seed.sql` and the calculation
 * tests. Keeping one source of truth lets the tests verify the seeded totals.
 */
import { convertToBaseMinor, toMinorUnits } from '@/lib/money';
import { computeSplits, type SplitMethod, type SplitParticipantInput } from '@/lib/split';
import type { ExpenseView } from '@/lib/types';

export const BASE_CURRENCY = 'THB';
export const SGD_RATE = '26';
export const TRIP_START = '2025-03-14';
export const TRIP_END = '2025-03-17';

export const NON = 'non';
export const MEW = 'mew';
export const PRAEW = 'praew';
export const MEMBER_IDS = [NON, MEW, PRAEW];

interface SeedExpense {
  id: string;
  description: string;
  category: string;
  expenseDate: string;
  tripDay: number | null;
  originalAmount: string;
  currencyCode: string;
  exchangeRate: string;
  payerMemberId: string | null;
  includedInSettlement: boolean;
  splitMethod: SplitMethod;
  participants: SplitParticipantInput[];
  notes?: string;
}

export const SEED_EXPENSES: SeedExpense[] = [
  {
    id: 'flight',
    description: 'ตั๋วเครื่องบินไป-กลับ (จ่ายก่อนเดินทาง เคลียร์กันแล้ว)',
    category: 'transport',
    expenseDate: '2025-02-10',
    tripDay: 0,
    originalAmount: '24000',
    currencyCode: 'THB',
    exchangeRate: '1',
    payerMemberId: NON,
    includedInSettlement: false,
    splitMethod: 'equal',
    participants: MEMBER_IDS.map((memberId) => ({ memberId })),
    notes: 'โอนคืนนนท์ครบแล้วตั้งแต่ก่อนเดินทาง',
  },
  {
    id: 'hotel',
    description: 'โรงแรมย่าน Bugis 3 คืน',
    category: 'lodging',
    expenseDate: '2025-03-14',
    tripDay: 1,
    originalAmount: '540',
    currencyCode: 'SGD',
    exchangeRate: SGD_RATE,
    payerMemberId: NON,
    includedInSettlement: true,
    splitMethod: 'equal',
    participants: MEMBER_IDS.map((memberId) => ({ memberId })),
  },
  {
    id: 'dinner-day1',
    description: 'ข้าวเย็นวันแรก ร้าน Chicken Rice',
    category: 'food',
    expenseDate: '2025-03-14',
    tripDay: 1,
    originalAmount: '96.50',
    currencyCode: 'SGD',
    exchangeRate: SGD_RATE,
    payerMemberId: PRAEW,
    includedInSettlement: true,
    splitMethod: 'equal',
    participants: MEMBER_IDS.map((memberId) => ({ memberId })),
  },
  {
    id: 'uss',
    description: 'ตั๋ว Universal Studios (เฉพาะมิวกับแพรว)',
    category: 'tickets',
    expenseDate: '2025-03-15',
    tripDay: 2,
    originalAmount: '166',
    currencyCode: 'SGD',
    exchangeRate: SGD_RATE,
    payerMemberId: MEW,
    includedInSettlement: true,
    splitMethod: 'equal',
    participants: [{ memberId: MEW }, { memberId: PRAEW }],
  },
  {
    id: 'mrt',
    description: 'ค่ารถ MRT (ต่างคนต่างจ่ายเอง)',
    category: 'transport',
    expenseDate: '2025-03-15',
    tripDay: 2,
    originalAmount: '300',
    currencyCode: 'THB',
    exchangeRate: '1',
    payerMemberId: null,
    includedInSettlement: false,
    splitMethod: 'equal',
    participants: MEMBER_IDS.map((memberId) => ({ memberId })),
    notes: 'แต่ละคนแตะบัตรของตัวเอง',
  },
  {
    id: 'lunch-day2',
    description: 'ข้าวกลางวันวันที่สอง',
    category: 'food',
    expenseDate: '2025-03-15',
    tripDay: 2,
    originalAmount: '63',
    currencyCode: 'SGD',
    exchangeRate: SGD_RATE,
    payerMemberId: NON,
    includedInSettlement: true,
    splitMethod: 'equal',
    participants: MEMBER_IDS.map((memberId) => ({ memberId })),
  },
  {
    id: 'dessert-mew',
    description: 'บิงซูของมิว (กินคนเดียว)',
    category: 'dessert',
    expenseDate: '2025-03-15',
    tripDay: 2,
    originalAmount: '12.50',
    currencyCode: 'SGD',
    exchangeRate: SGD_RATE,
    payerMemberId: MEW,
    includedInSettlement: true,
    splitMethod: 'personal',
    participants: [{ memberId: MEW }],
  },
  {
    id: 'souvenir-praew',
    description: 'ของฝากที่แพรวซื้อเอง',
    category: 'souvenir',
    expenseDate: '2025-03-16',
    tripDay: 3,
    originalAmount: '45',
    currencyCode: 'SGD',
    exchangeRate: SGD_RATE,
    payerMemberId: PRAEW,
    includedInSettlement: true,
    splitMethod: 'personal',
    participants: [{ memberId: PRAEW }],
  },
  {
    id: 'dinner-day3',
    description: 'ข้าวเย็นวันที่สาม (นนท์กินเยอะกว่า หาร 2:1:1)',
    category: 'food',
    expenseDate: '2025-03-16',
    tripDay: 3,
    originalAmount: '120',
    currencyCode: 'SGD',
    exchangeRate: SGD_RATE,
    payerMemberId: NON,
    includedInSettlement: true,
    splitMethod: 'shares',
    participants: [
      { memberId: NON, value: 2 },
      { memberId: MEW, value: 1 },
      { memberId: PRAEW, value: 1 },
    ],
  },
  {
    id: 'drinks',
    description: 'เครื่องดื่มร้านบาร์ริมน้ำ',
    category: 'drinks',
    expenseDate: '2025-03-16',
    tripDay: 3,
    originalAmount: '890',
    currencyCode: 'THB',
    exchangeRate: '1',
    payerMemberId: MEW,
    includedInSettlement: true,
    splitMethod: 'equal',
    participants: MEMBER_IDS.map((memberId) => ({ memberId })),
  },
];

/** Expands the seed into the same shape the app loads from the database. */
export function buildSeedExpenses(): ExpenseView[] {
  return SEED_EXPENSES.map((seed) => {
    const baseAmountMinor = convertToBaseMinor(
      seed.originalAmount,
      seed.currencyCode,
      seed.exchangeRate,
      BASE_CURRENCY,
    );
    const lines = computeSplits(
      seed.splitMethod,
      baseAmountMinor,
      seed.participants.map((participant) => ({
        memberId: participant.memberId,
        value:
          seed.splitMethod === 'exact' && participant.value
            ? toMinorUnits(String(participant.value), BASE_CURRENCY)
            : participant.value,
      })),
    );

    return {
      id: seed.id,
      description: seed.description,
      category: seed.category,
      expenseDate: seed.expenseDate,
      tripDay: seed.tripDay,
      originalAmount: seed.originalAmount,
      currencyCode: seed.currencyCode,
      exchangeRate: seed.exchangeRate,
      baseAmountMinor,
      payerMemberId: seed.payerMemberId,
      includedInSettlement: seed.includedInSettlement,
      notes: seed.notes ?? null,
      createdBy: null,
      updatedBy: null,
      createdAt: `${seed.expenseDate}T12:00:00.000Z`,
      updatedAt: `${seed.expenseDate}T12:00:00.000Z`,
      splits: lines.map((line) => ({
        memberId: line.memberId,
        splitMethod: line.splitMethod,
        shareValue: line.shareValue,
        amountMinor: line.amountMinor,
      })),
    } satisfies ExpenseView;
  });
}
