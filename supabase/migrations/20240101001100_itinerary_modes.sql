-- ---------------------------------------------------------------------------
-- More ways to travel, and places that need no coordinates.
--
-- The planner is a hand-written list of places: a stop is useful with nothing
-- but a name, so coordinates become optional. They stay on the table because a
-- map or a routing provider would need them again.
-- ---------------------------------------------------------------------------

alter type public.transport_mode add value if not exists 'flight';
alter type public.transport_mode add value if not exists 'train';
alter type public.transport_mode add value if not exists 'ferry';
alter type public.transport_mode add value if not exists 'taxi';

alter table public.itinerary_stops alter column latitude drop not null;
alter table public.itinerary_stops alter column longitude drop not null;
