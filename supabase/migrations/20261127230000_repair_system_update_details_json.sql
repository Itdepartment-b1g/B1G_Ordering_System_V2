-- Repair details where bullet.title is a stringified {"title","description"} object.

CREATE OR REPLACE FUNCTION public._repair_system_update_detail_elem(elem jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw_title text;
  parsed jsonb;
BEGIN
  raw_title := trim(both FROM COALESCE(elem ->> 'title', ''));

  IF raw_title <> '' AND left(raw_title, 1) = '{' THEN
    BEGIN
      parsed := raw_title::jsonb;
      IF parsed ? 'title' OR parsed ? 'description' THEN
        RETURN jsonb_build_object(
          'title', COALESCE(trim(both FROM parsed ->> 'title'), ''),
          'description', COALESCE(trim(both FROM parsed ->> 'description'), '')
        );
      END IF;
    EXCEPTION WHEN others THEN
      -- keep original
    END;
  END IF;

  RETURN jsonb_build_object(
    'title', COALESCE(trim(both FROM elem ->> 'title'), ''),
    'description', COALESCE(trim(both FROM elem ->> 'description'), '')
  );
END;
$$;

UPDATE public.system_updates
SET details = (
  SELECT COALESCE(
    jsonb_agg(public._repair_system_update_detail_elem(elem) ORDER BY ordinality),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(details, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ordinality)
)
WHERE jsonb_typeof(COALESCE(details, '[]'::jsonb)) = 'array';

DROP FUNCTION IF EXISTS public._repair_system_update_detail_elem(jsonb);
