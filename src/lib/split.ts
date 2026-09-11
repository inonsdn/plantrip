import Decimal from 'decimal.js';
import { allocate, sumMinor } from './money';

export const SPLIT_METHODS = ['equal', 'exact', 'percent', 'shares', 'personal'] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  equal: 'หารเท่ากัน',
  exact: 'ระบุจำนวนเงิน',
  percent: 'ระบุเปอร์เซ็นต์',
  shares: 'ระบุสัดส่วน',
  personal: 'รายการส่วนตัว',
};

export const SPLIT_METHOD_HINTS: Record<SplitMethod, string> = {
  equal: 'แบ่งยอดเท่า ๆ กันให้ทุกคนที่เลือก',
  exact: 'กรอกจำนวนเงินของแต่ละคน รวมกันต้องเท่ากับยอดรวม',
  percent: 'กรอกเปอร์เซ็นต์ของแต่ละคน รวมกันต้องได้ 100%',
  shares: 'กรอกสัดส่วน เช่น 2:1:1 ระบบจะคำนวณให้เอง',
  personal: 'รายการของคนเดียว ไม่หารกับใคร',
};

export interface SplitParticipantInput {
  memberId: string;
  /** exact amount in minor units / percent / share units. Unused for `equal`. */
  value?: number | string | null;
}

export interface SplitLine {
  memberId: string;
  splitMethod: SplitMethod;
  /** The raw input kept for auditability (percent, share units, exact amount). */
  shareValue: string | null;
  amountMinor: number;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
  }
}

function uniqueMembers(participants: readonly SplitParticipantInput[]): void {
  const seen = new Set<string>();
  for (const participant of participants) {
    if (seen.has(participant.memberId)) {
      throw new SplitError('มีสมาชิกซ้ำกันในรายการหาร');
    }
    seen.add(participant.memberId);
  }
}

function toDecimal(value: number | string | null | undefined, message: string): Decimal {
  if (value === null || value === undefined || value === '') throw new SplitError(message);
  let decimal: Decimal;
  try {
    decimal = new Decimal(typeof value === 'string' ? value.replace(/[,\s]/g, '') : value);
  } catch {
    throw new SplitError(message);
  }
  if (!decimal.isFinite()) throw new SplitError(message);
  return decimal;
}

/**
 * Turn a split definition into concrete per-member amounts in minor units.
 * The returned amounts always add up to exactly `totalMinor`.
 */
export function computeSplits(
  method: SplitMethod,
  totalMinor: number,
  participants: readonly SplitParticipantInput[],
): SplitLine[] {
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new SplitError('ยอดรวมต้องมากกว่า 0');
  }
  if (participants.length === 0) {
    throw new SplitError('ต้องเลือกสมาชิกอย่างน้อย 1 คน');
  }
  uniqueMembers(participants);

  switch (method) {
    case 'personal': {
      if (participants.length !== 1) {
        throw new SplitError('รายการส่วนตัวต้องเลือกสมาชิกเพียงคนเดียว');
      }
      return [
        {
          memberId: participants[0].memberId,
          splitMethod: 'personal',
          shareValue: null,
          amountMinor: totalMinor,
        },
      ];
    }

    case 'equal': {
      const amounts = allocate(
        totalMinor,
        participants.map(() => 1),
      );
      return participants.map((participant, index) => ({
        memberId: participant.memberId,
        splitMethod: 'equal' as const,
        shareValue: null,
        amountMinor: amounts[index],
      }));
    }

    case 'exact': {
      const amounts = participants.map((participant) => {
        const amount = toDecimal(participant.value, 'กรอกจำนวนเงินของทุกคนให้ครบ');
        if (!amount.isInteger()) {
          throw new SplitError('จำนวนเงินไม่ถูกต้อง');
        }
        if (amount.lessThan(0)) throw new SplitError('จำนวนเงินต้องไม่ติดลบ');
        return amount.toNumber();
      });
      const total = sumMinor(amounts);
      if (total !== totalMinor) {
        throw new SplitError('ผลรวมของแต่ละคนต้องเท่ากับยอดรวมของรายการ');
      }
      return participants.map((participant, index) => ({
        memberId: participant.memberId,
        splitMethod: 'exact' as const,
        shareValue: String(amounts[index]),
        amountMinor: amounts[index],
      }));
    }

    case 'percent': {
      const percents = participants.map((participant) => {
        const percent = toDecimal(participant.value, 'กรอกเปอร์เซ็นต์ของทุกคนให้ครบ');
        if (percent.lessThan(0)) throw new SplitError('เปอร์เซ็นต์ต้องไม่ติดลบ');
        return percent;
      });
      const total = percents.reduce((sum, percent) => sum.plus(percent), new Decimal(0));
      if (!total.equals(100)) {
        throw new SplitError('เปอร์เซ็นต์รวมกันต้องได้ 100%');
      }
      const amounts = allocate(totalMinor, percents);
      return participants.map((participant, index) => ({
        memberId: participant.memberId,
        splitMethod: 'percent' as const,
        shareValue: percents[index].toString(),
        amountMinor: amounts[index],
      }));
    }

    case 'shares': {
      const shares = participants.map((participant) => {
        const share = toDecimal(participant.value, 'กรอกสัดส่วนของทุกคนให้ครบ');
        if (share.lessThanOrEqualTo(0)) throw new SplitError('สัดส่วนต้องมากกว่า 0');
        return share;
      });
      const amounts = allocate(totalMinor, shares);
      return participants.map((participant, index) => ({
        memberId: participant.memberId,
        splitMethod: 'shares' as const,
        shareValue: shares[index].toString(),
        amountMinor: amounts[index],
      }));
    }

    default: {
      const exhaustive: never = method;
      throw new SplitError(`ไม่รู้จักวิธีหาร: ${String(exhaustive)}`);
    }
  }
}
