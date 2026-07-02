-- Scope rebate visibility: KAMs see only their rebates; directors see own + assigned KAM rebates.

DROP POLICY IF EXISTS "KA rebates viewable by company key account roles" ON public.key_account_po_rebates;

CREATE POLICY "KA rebates viewable by company key account roles" ON public.key_account_po_rebates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'warehouse'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = key_account_po_rebates.company_id
        AND p.role = ANY (ARRAY[
          'sales_admin'::text, 'sales_head'::text, 'key_account_accounting'::text
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = key_account_po_rebates.company_id
        AND p.role = 'key_account_manager'
        AND (
          key_account_po_rebates.kam_id = auth.uid()
          OR key_account_po_rebates.created_by = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = key_account_po_rebates.company_id
        AND p.role = 'sales_director'
        AND (
          key_account_po_rebates.kam_id = auth.uid()
          OR key_account_po_rebates.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.kam_director_assignments a
            WHERE a.director_id = auth.uid()
              AND a.kam_id = key_account_po_rebates.kam_id
          )
        )
    )
  );
