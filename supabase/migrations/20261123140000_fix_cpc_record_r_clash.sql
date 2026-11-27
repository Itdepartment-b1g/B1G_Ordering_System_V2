-- Fix: plpgsql DECLARE r record collided with SQL alias "r" in _cpc_sync_agreements
-- → "record \"r\" is not assigned yet" when creating team-scoped price batches.

CREATE OR REPLACE FUNCTION public._cpc_team_roster_many(p_company_id uuid, p_leader_ids uuid[])
RETURNS TABLE (
  profile_id uuid,
  profile_name text,
  profile_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (roster.profile_id)
    roster.profile_id,
    roster.profile_name,
    roster.profile_role
  FROM unnest(coalesce(p_leader_ids, '{}'::uuid[])) AS lid(leader_id)
  CROSS JOIN LATERAL public._cpc_team_roster(p_company_id, lid.leader_id) roster
  ORDER BY roster.profile_id;
$$;

CREATE OR REPLACE FUNCTION public._cpc_sync_agreements(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_status text;
  v_scope text;
  v_leader_ids uuid[];
  rec record;
BEGIN
  SELECT company_id, status, scope_type, target_leader_ids
  INTO v_company_id, v_status, v_scope, v_leader_ids
  FROM public.company_price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_status IS DISTINCT FROM 'pending_agreement' THEN
    RETURN;
  END IF;

  v_scope := coalesce(v_scope, 'company');
  v_leader_ids := coalesce(v_leader_ids, '{}'::uuid[]);

  IF v_scope = 'team' AND cardinality(v_leader_ids) >= 1 THEN
    UPDATE public.company_price_change_agreements a
    SET status = 'revoked'
    WHERE a.batch_id = p_batch_id
      AND a.status = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM public._cpc_team_roster_many(v_company_id, v_leader_ids) roster
        WHERE roster.profile_id = a.profile_id
      );

    FOR rec IN
      SELECT profile_id AS id, profile_name, profile_role AS role
      FROM public._cpc_team_roster_many(v_company_id, v_leader_ids) tr
      WHERE NOT EXISTS (
        SELECT 1 FROM public.company_price_change_agreements a
        WHERE a.batch_id = p_batch_id AND a.profile_id = tr.profile_id
      )
    LOOP
      INSERT INTO public.company_price_change_agreements (
        batch_id, company_id, profile_id, profile_name, profile_role, status
      ) VALUES (
        p_batch_id, v_company_id, rec.id, rec.profile_name, rec.role, 'pending'
      );

      INSERT INTO public.notifications (
        company_id, user_id, notification_type, title, message, reference_type, reference_id
      ) VALUES (
        v_company_id,
        rec.id,
        'system_message',
        'Price change needs your confirmation',
        'Review and confirm the new Selling / DSP / RSP before bags update.',
        'company_price_change_batch',
        p_batch_id
      );
    END LOOP;
  ELSE
    UPDATE public.company_price_change_agreements a
    SET status = 'revoked'
    FROM public.profiles p
    WHERE a.batch_id = p_batch_id
      AND a.profile_id = p.id
      AND a.status = 'pending'
      AND (
        p.status IS DISTINCT FROM 'active'
        OR p.role NOT IN ('team_leader', 'mobile_sales')
        OR p.company_id IS DISTINCT FROM v_company_id
      );

    FOR rec IN
      SELECT p.id, coalesce(nullif(btrim(p.full_name), ''), p.email) AS profile_name, p.role
      FROM public.profiles p
      WHERE p.company_id = v_company_id
        AND p.status = 'active'
        AND p.role IN ('team_leader', 'mobile_sales')
        AND NOT EXISTS (
          SELECT 1 FROM public.company_price_change_agreements a
          WHERE a.batch_id = p_batch_id AND a.profile_id = p.id
        )
    LOOP
      INSERT INTO public.company_price_change_agreements (
        batch_id, company_id, profile_id, profile_name, profile_role, status
      ) VALUES (
        p_batch_id, v_company_id, rec.id, rec.profile_name, rec.role, 'pending'
      );

      INSERT INTO public.notifications (
        company_id, user_id, notification_type, title, message, reference_type, reference_id
      ) VALUES (
        v_company_id,
        rec.id,
        'system_message',
        'Price change needs your confirmation',
        'Review and confirm the new Selling / DSP / RSP before bags update.',
        'company_price_change_batch',
        p_batch_id
      );
    END LOOP;
  END IF;
END;
$$;
