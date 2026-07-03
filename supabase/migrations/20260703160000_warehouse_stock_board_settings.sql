-- Warehouse stock board: company-level low-stock threshold and badge colors.

CREATE TABLE IF NOT EXISTS public.warehouse_stock_board_settings (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    low_stock_threshold INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
    use_per_sku_reorder_level BOOLEAN NOT NULL DEFAULT TRUE,
    color_out_of_stock TEXT NOT NULL DEFAULT '#dc2626',
    color_out_of_stock_text TEXT NOT NULL DEFAULT '#ffffff',
    color_low_stock TEXT NOT NULL DEFAULT '#fbbf24',
    color_low_stock_text TEXT NOT NULL DEFAULT '#451a03',
    color_in_stock TEXT NOT NULL DEFAULT '#059669',
    color_in_stock_text TEXT NOT NULL DEFAULT '#ffffff',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.warehouse_stock_board_settings IS
  'Per-company stock board legend: low-stock threshold and badge colors for the warehouse dashboard.';

INSERT INTO public.warehouse_stock_board_settings (company_id)
SELECT c.id
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

ALTER TABLE public.warehouse_stock_board_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view stock board settings" ON public.warehouse_stock_board_settings;
CREATE POLICY "Company members can view stock board settings"
    ON public.warehouse_stock_board_settings
    FOR SELECT
    USING (
        company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    );

DROP POLICY IF EXISTS "Warehouse and admins can update stock board settings" ON public.warehouse_stock_board_settings;
CREATE POLICY "Warehouse and admins can update stock board settings"
    ON public.warehouse_stock_board_settings
    FOR UPDATE
    USING (
        company_id IN (
            SELECT p.company_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('warehouse', 'admin', 'super_admin')
        )
    )
    WITH CHECK (
        company_id IN (
            SELECT p.company_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('warehouse', 'admin', 'super_admin')
        )
    );

CREATE OR REPLACE FUNCTION public.upsert_warehouse_stock_board_settings(
    p_low_stock_threshold INTEGER,
    p_use_per_sku_reorder_level BOOLEAN,
    p_color_out_of_stock TEXT,
    p_color_out_of_stock_text TEXT,
    p_color_low_stock TEXT,
    p_color_low_stock_text TEXT,
    p_color_in_stock TEXT,
    p_color_in_stock_text TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
    v_user_role TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Unauthorized');
    END IF;

    SELECT company_id, role INTO v_company_id, v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_company_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'User does not belong to any company');
    END IF;

    IF v_user_role NOT IN ('warehouse', 'admin', 'super_admin') THEN
        RETURN json_build_object('success', false, 'message', 'Unauthorized');
    END IF;

    IF p_low_stock_threshold IS NULL OR p_low_stock_threshold < 0 THEN
        RETURN json_build_object('success', false, 'message', 'Invalid low stock threshold');
    END IF;

    INSERT INTO public.warehouse_stock_board_settings (
        company_id,
        low_stock_threshold,
        use_per_sku_reorder_level,
        color_out_of_stock,
        color_out_of_stock_text,
        color_low_stock,
        color_low_stock_text,
        color_in_stock,
        color_in_stock_text,
        updated_at
    )
    VALUES (
        v_company_id,
        p_low_stock_threshold,
        COALESCE(p_use_per_sku_reorder_level, TRUE),
        COALESCE(NULLIF(TRIM(p_color_out_of_stock), ''), '#dc2626'),
        COALESCE(NULLIF(TRIM(p_color_out_of_stock_text), ''), '#ffffff'),
        COALESCE(NULLIF(TRIM(p_color_low_stock), ''), '#fbbf24'),
        COALESCE(NULLIF(TRIM(p_color_low_stock_text), ''), '#451a03'),
        COALESCE(NULLIF(TRIM(p_color_in_stock), ''), '#059669'),
        COALESCE(NULLIF(TRIM(p_color_in_stock_text), ''), '#ffffff'),
        NOW()
    )
    ON CONFLICT (company_id) DO UPDATE SET
        low_stock_threshold = EXCLUDED.low_stock_threshold,
        use_per_sku_reorder_level = EXCLUDED.use_per_sku_reorder_level,
        color_out_of_stock = EXCLUDED.color_out_of_stock,
        color_out_of_stock_text = EXCLUDED.color_out_of_stock_text,
        color_low_stock = EXCLUDED.color_low_stock,
        color_low_stock_text = EXCLUDED.color_low_stock_text,
        color_in_stock = EXCLUDED.color_in_stock,
        color_in_stock_text = EXCLUDED.color_in_stock_text,
        updated_at = NOW();

    RETURN json_build_object(
        'success', true,
        'message', 'Stock board settings saved'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.upsert_warehouse_stock_board_settings IS
  'Upserts warehouse stock board threshold and colors for the caller company.';

GRANT EXECUTE ON FUNCTION public.upsert_warehouse_stock_board_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.insert_default_warehouse_stock_board_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.warehouse_stock_board_settings (company_id)
    VALUES (NEW.id)
    ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_insert_default_warehouse_stock_board_settings ON public.companies;
CREATE TRIGGER trigger_insert_default_warehouse_stock_board_settings
    AFTER INSERT ON public.companies
    FOR EACH ROW
    EXECUTE FUNCTION public.insert_default_warehouse_stock_board_settings();
