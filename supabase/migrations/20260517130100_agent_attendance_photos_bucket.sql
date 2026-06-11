-- Private bucket for time-in photos; paths: {user_id}/{filename}

INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-attendance-photos', 'agent-attendance-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Agent attendance photos: mobile_sales insert own folder" ON storage.objects;
CREATE POLICY "Agent attendance photos: mobile_sales insert own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'agent-attendance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'mobile_sales'::text
        AND p.status = 'active'::text
    )
  );

DROP POLICY IF EXISTS "Agent attendance photos: read owner or team leader" ON storage.objects;
CREATE POLICY "Agent attendance photos: read owner or team leader"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'agent-attendance-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'team_leader'::text
            AND p.status = 'active'::text
        )
        AND EXISTS (
          SELECT 1
          FROM public.leader_teams lt
          WHERE lt.leader_id = auth.uid()
            AND lt.agent_id::text = (storage.foldername(name))[1]
        )
      )
    )
  );
