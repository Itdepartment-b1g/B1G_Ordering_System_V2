-- Create the storage bucket for daily attachments (visit photos)
insert into storage.buckets (id, name, public)
values ('daily-attachments', 'daily-attachments', true)
on conflict (id) do nothing;

-- Policy: Allow authenticated users to upload files
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'daily-attachments' );

-- Policy: Allow public to view files (for displaying in the app)
create policy "Allow public view"
on storage.objects for select
to public
using ( bucket_id = 'daily-attachments' );

-- Policy: Allow users to delete their own files (optional, but good practice)
create policy "Allow users to delete own files"
on storage.objects for delete
to authenticated
using ( bucket_id = 'daily-attachments' and auth.uid() = owner );
