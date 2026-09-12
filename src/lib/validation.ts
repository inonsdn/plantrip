import { z } from 'zod';
import { EXPENSE_CATEGORIES } from './categories';
import { SPLIT_METHODS } from './split';

const amountPattern = /^\d{1,12}(\.\d{1,4})?$/;
const ratePattern = /^\d{1,12}(\.\d{1,8})?$/;
const currencyPattern = /^[A-Z]{3}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const money = z
  .string()
  .trim()
  .transform((value) => value.replace(/[,\s]/g, ''))
  .refine((value) => amountPattern.test(value), 'กรอกจำนวนเงินเป็นตัวเลข')
  .refine((value) => Number(value) > 0, 'จำนวนเงินต้องมากกว่า 0');

const rate = z
  .string()
  .trim()
  .transform((value) => value.replace(/[,\s]/g, ''))
  .refine((value) => ratePattern.test(value), 'กรอกอัตราแลกเปลี่ยนเป็นตัวเลข')
  .refine((value) => Number(value) > 0, 'อัตราแลกเปลี่ยนต้องมากกว่า 0');

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => currencyPattern.test(value), 'สกุลเงินต้องเป็นรหัส 3 ตัวอักษร');

const dateOnly = z
  .string()
  .trim()
  .refine((value) => datePattern.test(value), 'รูปแบบวันที่ไม่ถูกต้อง');

export const createTripSchema = z
  .object({
    name: z.string().trim().min(1, 'กรุณาตั้งชื่อทริป').max(120, 'ชื่อทริปยาวเกินไป'),
    destination: z.string().trim().max(160, 'ชื่อจุดหมายยาวเกินไป').default(''),
    startDate: z.union([dateOnly, z.literal('')]).optional(),
    endDate: z.union([dateOnly, z.literal('')]).optional(),
    baseCurrency: currency.default('THB'),
    secondaryCurrency: z.union([currency, z.literal('')]).optional(),
    secondaryRate: z.union([rate, z.literal('')]).optional(),
    ownerDisplayName: z.string().trim().min(1, 'กรุณากรอกชื่อของคุณ').max(60, 'ชื่อยาวเกินไป'),
  })
  .refine(
    (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
    { message: 'วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่มต้น', path: ['endDate'] },
  )
  .refine(
    (value) => !value.secondaryCurrency || value.secondaryCurrency !== value.baseCurrency,
    { message: 'สกุลเงินรองต้องต่างจากสกุลเงินหลัก', path: ['secondaryCurrency'] },
  );

export type CreateTripInput = z.input<typeof createTripSchema>;

export const splitParticipantSchema = z.object({
  memberId: z.string().uuid('สมาชิกไม่ถูกต้อง'),
  /** Exact amount (base currency), percent, or share units — depends on method. */
  value: z.string().trim().optional().nullable(),
});

export const expenseInputSchema = z
  .object({
    tripId: z.string().uuid(),
    expenseId: z.string().uuid().optional().nullable(),
    description: z.string().trim().min(1, 'กรุณากรอกรายละเอียด').max(200, 'รายละเอียดยาวเกินไป'),
    category: z.enum(EXPENSE_CATEGORIES).default('other'),
    amount: money,
    currencyCode: currency,
    exchangeRate: rate,
    expenseDate: dateOnly,
    tripDay: z.number().int().min(0).max(365).nullable().optional(),
    payerMemberId: z.string().uuid().nullable(),
    includedInSettlement: z.boolean(),
    notes: z.string().trim().max(1000, 'บันทึกยาวเกินไป').nullable().optional(),
    splitMethod: z.enum(SPLIT_METHODS),
    participants: z.array(splitParticipantSchema).min(1, 'ต้องเลือกสมาชิกอย่างน้อย 1 คน'),
    // Optional link back to the itinerary. Only set when the expense is created
    // from a leg; the database refuses a reference to another trip.
    itineraryDayId: z.string().uuid().nullable().optional(),
    itineraryOriginStopId: z.string().uuid().nullable().optional(),
    itineraryDestinationStopId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => value.payerMemberId !== null || !value.includedInSettlement, {
    message: 'รายการที่ไม่มีผู้จ่ายหลัก ต้องไม่นำไปคำนวณยอดโอน',
    path: ['payerMemberId'],
  })
  .refine((value) => value.splitMethod !== 'personal' || value.participants.length === 1, {
    message: 'รายการส่วนตัวต้องเลือกสมาชิกเพียงคนเดียว',
    path: ['participants'],
  });

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const settlementInputSchema = z.object({
  tripId: z.string().uuid(),
  /** Present when settling one specific expense rather than a whole balance. */
  expenseId: z.string().uuid().nullable().optional(),
  fromMemberId: z.string().uuid(),
  toMemberId: z.string().uuid(),
  amount: money,
  note: z.string().trim().max(300).nullable().optional(),
});

export const renameMemberSchema = z.object({
  memberId: z.string().uuid(),
  displayName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(60, 'ชื่อยาวเกินไป'),
});

/** Turns a ZodError into `{ field: message }` for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
