-- ---------------------------------------------------------------------------
-- A note on the journey itself — "จองตั๋วล่วงหน้า", "ขึ้นทางออก 3".
-- ---------------------------------------------------------------------------

alter table public.itinerary_leg_preferences
  add column notes text check (notes is null or char_length(notes) <= 1000);
