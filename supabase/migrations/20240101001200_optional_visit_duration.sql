-- ---------------------------------------------------------------------------
-- "อยู่ที่นี่นานเท่าไร" may be left unanswered.
--
-- Null means genuinely unknown, not zero: the schedule then reports the
-- departure from that stop — and every arrival after it — as uncomputable,
-- the same way it already treats a journey with no travel time.
-- ---------------------------------------------------------------------------

alter table public.itinerary_stops alter column visit_duration_minutes drop not null;
