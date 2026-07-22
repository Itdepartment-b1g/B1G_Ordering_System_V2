-- Bulk resolve open delivery discrepancies (same resolution for selected line IDs).

CREATE OR REPLACE FUNCTION public.resolve_po_delivery_discrepancies_bulk(
  p_discrepancy_ids uuid[],
  p_resolution text,
  p_notes text DEFAULT NULL,
  p_resolved_by uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_result json;
  v_ok integer := 0;
  v_fail integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_qty integer := 0;
BEGIN
  IF p_discrepancy_ids IS NULL OR cardinality(p_discrepancy_ids) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Select at least one shortage line');
  END IF;

  FOREACH v_id IN ARRAY p_discrepancy_ids
  LOOP
    v_result := public.resolve_po_delivery_discrepancy(
      v_id,
      p_resolution,
      p_notes,
      p_resolved_by
    );

    IF COALESCE((v_result->>'success')::boolean, false) THEN
      v_ok := v_ok + 1;
      v_qty := v_qty + COALESCE((v_result->>'quantity')::integer, 0);
    ELSE
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object(
          'discrepancy_id', v_id,
          'error', COALESCE(v_result->>'error', 'Resolve failed')
        )
      );
    END IF;
  END LOOP;

  IF v_ok = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', COALESCE(v_errors->0->>'error', 'No shortages were resolved'),
      'resolved_count', v_ok,
      'failed_count', v_fail,
      'errors', v_errors
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'resolution', lower(btrim(COALESCE(p_resolution, ''))),
    'resolved_count', v_ok,
    'failed_count', v_fail,
    'quantity', v_qty,
    'errors', v_errors
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_po_delivery_discrepancies_bulk(uuid[], text, text, uuid) IS
  'Resolve multiple open delivery discrepancy lines with the same action (redeliver or write_off).';

GRANT EXECUTE ON FUNCTION public.resolve_po_delivery_discrepancies_bulk(uuid[], text, text, uuid) TO authenticated;
