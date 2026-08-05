-- Continue inventory batch ##### across months.
-- Format stays BATCH-YYYY-MM-##### (YYYY-MM = receive month), but the sequence
-- no longer resets when the calendar month changes.
-- Counter key year_month = 'ALL' holds the company-wide running number.

-- Seed continuous counters from existing monthly counters + issued batch numbers.
WITH from_counters AS (
  SELECT
    company_id,
    MAX(last_number) AS max_n
  FROM public.inventory_batch_number_counters
  WHERE year_month <> 'ALL'
  GROUP BY company_id
),
from_batches AS (
  SELECT
    company_id,
    MAX(
      (substring(batch_number FROM 'BATCH-[0-9]{4}-[0-9]{2}-([0-9]+)$'))::integer
    ) AS max_n
  FROM public.inventory_batches
  WHERE batch_number ~ '^BATCH-[0-9]{4}-[0-9]{2}-[0-9]+$'
  GROUP BY company_id
),
combined AS (
  SELECT
    company_id,
    MAX(max_n) AS max_n
  FROM (
    SELECT company_id, max_n FROM from_counters
    UNION ALL
    SELECT company_id, max_n FROM from_batches
  ) u
  WHERE max_n IS NOT NULL
  GROUP BY company_id
)
INSERT INTO public.inventory_batch_number_counters (company_id, year_month, last_number)
SELECT company_id, 'ALL', max_n
FROM combined
WHERE max_n > 0
ON CONFLICT (company_id, year_month)
DO UPDATE SET last_number = GREATEST(
  public.inventory_batch_number_counters.last_number,
  EXCLUDED.last_number
);

CREATE OR REPLACE FUNCTION public.generate_inventory_batch_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year_month text;
  v_next integer;
  -- Sentinel key: one running sequence per company (not a calendar month).
  c_counter_key constant text := 'ALL';
BEGIN
  v_year_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  INSERT INTO public.inventory_batch_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, c_counter_key, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.inventory_batch_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'BATCH-' || v_year_month || '-' || lpad(v_next::text, 5, '0');
END;
$$;

COMMENT ON FUNCTION public.generate_inventory_batch_number(uuid) IS
  'Returns BATCH-YYYY-MM-#####. YYYY-MM is the current UTC month; ##### is a company-wide sequence that continues across months.';

COMMENT ON TABLE public.inventory_batches IS
  'Warehouse inventory receipt batches. Each receive event gets BATCH-YYYY-MM-##### (month in label; sequence continues across months). Opening balance seeded once per hub company.';
