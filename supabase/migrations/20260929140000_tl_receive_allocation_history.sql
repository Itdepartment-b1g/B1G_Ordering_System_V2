-- Inbound allocation log when a TL-to-TL requester receives stock.
-- Does not change existing main-to-leader or leader-to-agent rows.

ALTER TABLE public.allocation_history
  DROP CONSTRAINT IF EXISTS allocation_history_allocation_type_check;

ALTER TABLE public.allocation_history
  ADD CONSTRAINT allocation_history_allocation_type_check CHECK (
    allocation_type = ANY (ARRAY[
      'main_to_leader'::text,
      'leader_to_agent'::text,
      'leader_to_leader'::text
    ])
  );

ALTER TABLE public.allocation_history
  ADD COLUMN IF NOT EXISTS tl_stock_request_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'allocation_history_tl_stock_request_id_fkey'
  ) THEN
    ALTER TABLE public.allocation_history
      ADD CONSTRAINT allocation_history_tl_stock_request_id_fkey
      FOREIGN KEY (tl_stock_request_id)
      REFERENCES public.tl_stock_requests (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS allocation_history_tl_stock_request_id_uidx
  ON public.allocation_history (tl_stock_request_id)
  WHERE tl_stock_request_id IS NOT NULL;

COMMENT ON COLUMN public.allocation_history.allocation_type IS
  'main_to_leader | leader_to_agent | leader_to_leader';
COMMENT ON COLUMN public.allocation_history.tl_stock_request_id IS
  'Set for TL-to-TL inbound logs. One session per stock transfer.';

CREATE OR REPLACE FUNCTION public._tl_log_receive_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_header record;
  v_allocation_id uuid;
  v_brand_id uuid;
  v_existing_brand uuid;
BEGIN
  IF NEW.transaction_type IS DISTINCT FROM 'tl_stock_transfer_in' THEN
    RETURN NEW;
  END IF;
  IF NEW.reference_type IS DISTINCT FROM 'tl_stock_request' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.notes, '') NOT ILIKE 'TL transfer receive%' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id, company_id, requester_leader_id, source_leader_id, request_number
  INTO v_header
  FROM public.tl_stock_requests
  WHERE id = NEW.reference_id;

  IF v_header.id IS NULL OR v_header.requester_leader_id IS NULL OR v_header.source_leader_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT brand_id INTO v_brand_id
  FROM public.variants
  WHERE id = NEW.variant_id;

  SELECT id, brand_id
  INTO v_allocation_id, v_existing_brand
  FROM public.allocation_history
  WHERE tl_stock_request_id = v_header.id
    AND allocation_type = 'leader_to_leader'
  FOR UPDATE;

  IF v_allocation_id IS NULL THEN
    INSERT INTO public.allocation_history (
      company_id,
      allocated_to,
      allocated_by,
      brand_id,
      allocation_type,
      tl_stock_request_id
    ) VALUES (
      v_header.company_id,
      v_header.requester_leader_id,
      v_header.source_leader_id,
      v_brand_id,
      'leader_to_leader',
      v_header.id
    )
    RETURNING id INTO v_allocation_id;
  ELSIF v_existing_brand IS DISTINCT FROM v_brand_id THEN
    UPDATE public.allocation_history
    SET brand_id = NULL
    WHERE id = v_allocation_id
      AND brand_id IS NOT NULL;
  END IF;

  INSERT INTO public.inventory_transactions (
    company_id,
    variant_id,
    transaction_type,
    quantity,
    from_location,
    to_location,
    reference_type,
    reference_id,
    performed_by,
    notes
  ) VALUES (
    NEW.company_id,
    NEW.variant_id,
    'tl_stock_transfer_in',
    NEW.quantity,
    NEW.from_location,
    NEW.to_location,
    'allocation_history',
    v_allocation_id,
    NEW.performed_by,
    'TL to TL allocation ' || v_header.request_number
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tl_log_receive_allocation ON public.inventory_transactions;
CREATE TRIGGER trg_tl_log_receive_allocation
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW
EXECUTE PROCEDURE public._tl_log_receive_allocation();

-- Receives already completed before this log existed.
DO $$
DECLARE
  r record;
  v_allocation_id uuid;
  v_brand_id uuid;
  v_existing_brand uuid;
  v_first_at timestamptz;
BEGIN
  FOR r IN
    SELECT
      tx.company_id,
      tx.variant_id,
      tx.quantity,
      tx.from_location,
      tx.to_location,
      tx.performed_by,
      tx.created_at,
      req.id AS request_id,
      req.company_id AS request_company_id,
      req.requester_leader_id,
      req.source_leader_id,
      req.request_number
    FROM public.inventory_transactions tx
    JOIN public.tl_stock_requests req ON req.id = tx.reference_id
    WHERE tx.reference_type = 'tl_stock_request'
      AND tx.transaction_type = 'tl_stock_transfer_in'
      AND COALESCE(tx.notes, '') ILIKE 'TL transfer receive%'
      AND COALESCE(tx.quantity, 0) > 0
      AND req.requester_leader_id IS NOT NULL
      AND req.source_leader_id IS NOT NULL
    ORDER BY tx.created_at ASC, tx.id ASC
  LOOP
    SELECT brand_id INTO v_brand_id
    FROM public.variants
    WHERE id = r.variant_id;

    SELECT id, brand_id
    INTO v_allocation_id, v_existing_brand
    FROM public.allocation_history
    WHERE tl_stock_request_id = r.request_id
      AND allocation_type = 'leader_to_leader';

    IF v_allocation_id IS NULL THEN
      SELECT MIN(tx.created_at) INTO v_first_at
      FROM public.inventory_transactions tx
      WHERE tx.reference_type = 'tl_stock_request'
        AND tx.reference_id = r.request_id
        AND tx.transaction_type = 'tl_stock_transfer_in'
        AND COALESCE(tx.notes, '') ILIKE 'TL transfer receive%';

      INSERT INTO public.allocation_history (
        company_id,
        allocated_to,
        allocated_by,
        brand_id,
        allocation_type,
        tl_stock_request_id,
        created_at
      ) VALUES (
        r.request_company_id,
        r.requester_leader_id,
        r.source_leader_id,
        v_brand_id,
        'leader_to_leader',
        r.request_id,
        COALESCE(v_first_at, r.created_at)
      )
      RETURNING id INTO v_allocation_id;
    ELSIF v_existing_brand IS DISTINCT FROM v_brand_id THEN
      UPDATE public.allocation_history
      SET brand_id = NULL
      WHERE id = v_allocation_id
        AND brand_id IS NOT NULL;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id,
      variant_id,
      transaction_type,
      quantity,
      from_location,
      to_location,
      reference_type,
      reference_id,
      performed_by,
      notes,
      created_at
    ) VALUES (
      r.company_id,
      r.variant_id,
      'tl_stock_transfer_in',
      r.quantity,
      r.from_location,
      r.to_location,
      'allocation_history',
      v_allocation_id,
      r.performed_by,
      'TL to TL allocation ' || r.request_number,
      r.created_at
    );
  END LOOP;
END $$;
