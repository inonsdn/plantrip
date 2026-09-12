export const EXPENSE_CATEGORIES = [
  'food',
  'dessert',
  'drinks',
  'transport',
  'lodging',
  'tickets',
  'shopping',
  'souvenir',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface CategoryMeta {
  key: ExpenseCategory;
  label: string;
  /** Lucide icon name, resolved by <CategoryIcon />. */
  icon: string;
  /** Tailwind classes for the small category chip. */
  chipClass: string;
  /** Solid colour used by the breakdown bars. */
  barClass: string;
}

export const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  food: {
    key: 'food',
    label: 'อาหาร',
    icon: 'utensils',
    chipClass: 'bg-amber-50 text-amber-800 border-amber-200',
    barClass: 'bg-amber-400',
  },
  dessert: {
    key: 'dessert',
    label: 'ของหวาน',
    icon: 'ice-cream-cone',
    chipClass: 'bg-pink-50 text-pink-800 border-pink-200',
    barClass: 'bg-pink-400',
  },
  drinks: {
    key: 'drinks',
    label: 'เครื่องดื่ม',
    icon: 'cup-soda',
    chipClass: 'bg-sky-50 text-sky-800 border-sky-200',
    barClass: 'bg-sky-400',
  },
  transport: {
    key: 'transport',
    label: 'เดินทาง',
    icon: 'bus',
    chipClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    barClass: 'bg-indigo-400',
  },
  lodging: {
    key: 'lodging',
    label: 'ที่พัก',
    icon: 'bed-double',
    chipClass: 'bg-teal-50 text-teal-800 border-teal-200',
    barClass: 'bg-teal-500',
  },
  tickets: {
    key: 'tickets',
    label: 'ตั๋วและกิจกรรม',
    icon: 'ticket',
    // Moved off violet so it is not mistaken for the lavender brand colour.
    chipClass: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
    barClass: 'bg-fuchsia-400',
  },
  shopping: {
    key: 'shopping',
    label: 'ช้อปปิ้ง',
    icon: 'shopping-bag',
    chipClass: 'bg-orange-50 text-orange-800 border-orange-200',
    barClass: 'bg-orange-400',
  },
  souvenir: {
    key: 'souvenir',
    label: 'ของฝาก',
    icon: 'gift',
    chipClass: 'bg-rose-50 text-rose-800 border-rose-200',
    barClass: 'bg-rose-400',
  },
  other: {
    key: 'other',
    label: 'อื่น ๆ',
    icon: 'circle-dashed',
    chipClass: 'bg-slate-100 text-slate-700 border-slate-200',
    barClass: 'bg-slate-400',
  },
};

export const CATEGORY_LIST: CategoryMeta[] = EXPENSE_CATEGORIES.map((key) => CATEGORY_META[key]);

export function categoryMeta(key: string): CategoryMeta {
  return CATEGORY_META[key as ExpenseCategory] ?? CATEGORY_META.other;
}

/**
 * Keyword hints used to pre-select a category from the description.
 * Always a suggestion — the user can override it, and an explicit choice wins.
 */
const CATEGORY_KEYWORDS: Array<[ExpenseCategory, string[]]> = [
  ['dessert', ['ขนม', 'ของหวาน', 'เค้ก', 'ไอติม', 'ไอศ', 'บิงซู', 'โดนัท', 'ช็อกโก', 'dessert', 'cake', 'ice cream']],
  ['drinks', ['กาแฟ', 'ชา', 'น้ำ', 'เบียร์', 'เหล้า', 'ไวน์', 'ชานม', 'สมู', 'coffee', 'tea', 'beer', 'bar', 'drink', 'juice', 'starbucks']],
  ['food', ['ข้าว', 'อาหาร', 'มื้อ', 'เช้า', 'เที่ยง', 'เย็น', 'ก๋วยเตี๋ยว', 'หมูกระทะ', 'ปิ้งย่าง', 'บุฟเฟ่', 'ร้าน', 'ซูชิ', 'ราเมง', 'food', 'lunch', 'dinner', 'breakfast', 'restaurant', 'chicken rice', 'laksa']],
  ['lodging', ['โรงแรม', 'ที่พัก', 'โฮสเทล', 'airbnb', 'hotel', 'hostel', 'resort', 'มัดจำห้อง']],
  ['transport', ['แท็กซี่', 'taxi', 'grab', 'รถไฟ', 'mrt', 'bts', 'ตั๋วเครื่องบิน', 'เครื่องบิน', 'flight', 'bus', 'รถบัส', 'เรือ', 'ค่ารถ', 'น้ำมัน', 'ทางด่วน', 'ค่าเดินทาง', 'ezlink', 'mrt card']],
  ['tickets', ['ตั๋ว', 'บัตร', 'เข้าชม', 'สวนสนุก', 'พิพิธภัณฑ์', 'ticket', 'universal', 'zoo', 'museum', 'gardens', 'อควาเรียม', 'ทัวร์', 'tour']],
  ['souvenir', ['ของฝาก', 'souvenir', 'ของที่ระลึก', 'แม่เหล็ก', 'พวงกุญแจ']],
  ['shopping', ['ช้อป', 'ซื้อ', 'เสื้อ', 'รองเท้า', 'กระเป๋า', 'ห้าง', 'shopping', 'mall', 'uniqlo', 'outlet', 'ดิวตี้ฟรี', 'duty free']],
];

export function suggestCategory(description: string): ExpenseCategory | null {
  const text = description.trim().toLowerCase();
  if (text.length < 2) return null;
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }
  return null;
}
