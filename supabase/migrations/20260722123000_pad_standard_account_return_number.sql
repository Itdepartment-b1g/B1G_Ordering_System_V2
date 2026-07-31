-- Pad Standard Account return numbers to RT-YYYYMM-#### (e.g. RT-202607-0001).

CREATE OR REPLACE FUNCTION public.generate_standard_account_stock_return_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year_month text;
  v_next integer;
BEGIN
  v_year_month := to_char(now() AT TIME ZONE 'UTC', 'YYYYMM');

  INSERT INTO public.standard_account_stock_return_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.standard_account_stock_return_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'RT-' || v_year_month || '-' || lpad(v_next::text, 4, '0');
END;
$$;
