-- Create a new storage bucket for cash deposits
insert into storage.buckets (id, name, public)
values ('cash-deposits', 'cash-deposits', true)
on conflict (id) do nothing;

-- Set up security policies for the cash-deposits bucket

-- 1. Allow authenticated users to upload files
create policy "Authenticated users can upload deposit slips"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'cash-deposits' );

-- 2. Allow authenticated users to view files (since leaders/admins need to see them)
create policy "Authenticated users can view deposit slips"
on storage.objects for select
to authenticated
using ( bucket_id = 'cash-deposits' );

-- 3. Allow users to update their own uploads (optional, but good for retries)
create policy "Users can update their own deposit slips"
on storage.objects for update
to authenticated
using ( bucket_id = 'cash-deposits' AND owner = auth.uid() );

-- 4. Allow users to delete their own uploads (optional)
create policy "Users can delete their own deposit slips"
on storage.objects for delete
to authenticated
using ( bucket_id = 'cash-deposits' AND owner = auth.uid() );
