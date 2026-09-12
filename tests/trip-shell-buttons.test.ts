import { describe, expect, it } from 'vitest';
import { showsAddExpenseButton } from '@/components/trip/trip-shell';

const TRIP = '11111111-1111-1111-1111-111111111111';

describe('the floating add button', () => {
  it('offers ค่าใช้จ่าย on every tab except แผนการเดินทาง', () => {
    expect(showsAddExpenseButton(`/trips/${TRIP}`, TRIP)).toBe(true);
    expect(showsAddExpenseButton(`/trips/${TRIP}/expenses`, TRIP)).toBe(true);
    expect(showsAddExpenseButton(`/trips/${TRIP}/settlement`, TRIP)).toBe(true);
    expect(showsAddExpenseButton(`/trips/${TRIP}/members`, TRIP)).toBe(true);
  });

  it('stands down on the itinerary tab, which has its own button', () => {
    expect(showsAddExpenseButton(`/trips/${TRIP}/itinerary`, TRIP)).toBe(false);
  });

  it('is not confused by another trip whose id starts the same way', () => {
    expect(showsAddExpenseButton(`/trips/${TRIP}-other/itinerary`, TRIP)).toBe(true);
  });
});
