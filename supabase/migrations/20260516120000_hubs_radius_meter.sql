-- Geofence radius around hub coordinates (meters). Default 100 for new and existing rows.

ALTER TABLE public.hubs
  ADD COLUMN IF NOT EXISTS radius_meter double precision;

UPDATE public.hubs
SET radius_meter = 100
WHERE radius_meter IS NULL;

ALTER TABLE public.hubs
  ALTER COLUMN radius_meter SET DEFAULT 100;

ALTER TABLE public.hubs
  ALTER COLUMN radius_meter SET NOT NULL;

COMMENT ON COLUMN public.hubs.radius_meter IS
  'Radius in meters around hub latitude/longitude (geofence). Default 100.';
