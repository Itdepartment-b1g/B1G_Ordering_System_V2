-- Each update bullet becomes { title, description } stored as jsonb.
-- Safe if details is still text[] (older installs) or already jsonb (fresh installs).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_updates'
      AND column_name = 'details'
      AND udt_name = '_text'
  ) THEN
    ALTER TABLE public.system_updates
      ALTER COLUMN details DROP DEFAULT;

    ALTER TABLE public.system_updates
      ALTER COLUMN details TYPE jsonb
      USING (
        CASE
          WHEN details IS NULL THEN '[]'::jsonb
          ELSE COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'title', trim(both FROM t),
                  'description', ''
                )
              )
              FROM unnest(details) AS t
              WHERE trim(both FROM t) <> ''
            ),
            '[]'::jsonb
          )
        END
      );

    ALTER TABLE public.system_updates
      ALTER COLUMN details SET DEFAULT '[]'::jsonb;

    ALTER TABLE public.system_updates
      ALTER COLUMN details SET NOT NULL;
  END IF;
END $$;

-- RETURN type change requires drop + recreate.
DROP FUNCTION IF EXISTS public.list_unacknowledged_system_updates();

CREATE OR REPLACE FUNCTION public.list_unacknowledged_system_updates()
RETURNS TABLE (
  id uuid,
  title text,
  short_description text,
  details jsonb,
  published_at timestamptz,
  attachments json
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid := public.get_auth_company_id();
BEGIN
  IF v_user IS NULL OR v_company IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.title,
    u.short_description,
    u.details,
    u.published_at,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'file_name', a.file_name,
            'file_path', a.file_path,
            'mime_type', a.mime_type,
            'size_bytes', a.size_bytes
          )
          ORDER BY a.created_at
        )
        FROM public.system_update_attachments a
        WHERE a.update_id = u.id
      ),
      '[]'::json
    ) AS attachments
  FROM public.system_updates u
  JOIN public.system_update_companies suc ON suc.update_id = u.id AND suc.company_id = v_company
  WHERE u.status = 'published'
    AND NOT EXISTS (
      SELECT 1
      FROM public.system_update_acknowledgments ack
      WHERE ack.update_id = u.id
        AND ack.user_id = v_user
    )
  ORDER BY u.published_at ASC NULLS LAST, u.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_unacknowledged_system_updates() TO authenticated;
