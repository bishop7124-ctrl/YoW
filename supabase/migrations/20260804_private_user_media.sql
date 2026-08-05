-- Private user media
--
-- The first user-media implementation used a public-read bucket for plain
-- <img src> rendering. Product decision 2026-08-04: user uploads are private.
-- The app now stores stable yow-media:{path} references and resolves short-lived
-- signed URLs for the authenticated owner at render/export time.

UPDATE storage.buckets
SET public = false
WHERE id = 'user-media';

DROP POLICY IF EXISTS "Public read user-media" ON storage.objects;

DROP POLICY IF EXISTS "Users read own user-media" ON storage.objects;
CREATE POLICY "Users read own user-media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-media'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );
