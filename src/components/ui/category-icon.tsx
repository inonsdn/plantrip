import {
  BedDouble,
  Bus,
  CircleDashed,
  CupSoda,
  Gift,
  IceCreamCone,
  ShoppingBag,
  Ticket,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { categoryMeta } from '@/lib/categories';

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  'ice-cream-cone': IceCreamCone,
  'cup-soda': CupSoda,
  bus: Bus,
  'bed-double': BedDouble,
  ticket: Ticket,
  'shopping-bag': ShoppingBag,
  gift: Gift,
  'circle-dashed': CircleDashed,
};

export function CategoryIcon({ category, className = 'size-4' }: { category: string; className?: string }) {
  const meta = categoryMeta(category);
  const Icon = ICONS[meta.icon] ?? CircleDashed;
  return <Icon aria-hidden className={className} />;
}

/** Category chip: icon plus the Thai label, so meaning never depends on colour. */
export function CategoryChip({ category }: { category: string }) {
  const meta = categoryMeta(category);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${meta.chipClass}`}
    >
      <CategoryIcon category={category} className="size-3.5" />
      {meta.label}
    </span>
  );
}
