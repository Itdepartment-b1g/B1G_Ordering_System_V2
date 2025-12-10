# Client Photos Storage Setup Guide

## Problem
You're getting this error when adding clients:
```
StorageApiError: Bucket not found
POST .../storage/v1/object/client-photos/... 400 (Bad Request)
```

This means the `client-photos` storage bucket doesn't exist in your Supabase project.

## Solution

### Step 1: Choose Your Approach

**Option A: Simple Setup (Recommended for Development)**
- More permissive policies
- Easier to set up
- Good for testing and development
- Use file: `create_client_photos_bucket_simple.sql`

**Option B: Secure Setup (Recommended for Production)**
- Company-scoped policies
- More secure but complex
- Better for production
- Use file: `create_client_photos_bucket.sql`

### Step 2: Run the SQL Script

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy and paste the contents of your chosen SQL file:
   - For simple: `create_client_photos_bucket_simple.sql`
   - For secure: `create_client_photos_bucket.sql`
6. Click **Run** (or press Cmd/Ctrl + Enter)

### Step 3: Verify Creation

After running the script, you should see output confirming:
- ✅ Bucket created: `client-photos`
- ✅ File size limit: 5MB
- ✅ Allowed types: JPEG, PNG, WebP
- ✅ Policies created (4-5 policies depending on which script you used)

### Step 4: Test the Upload

1. Go back to your app
2. Navigate to the Clients page
3. Try adding a new client with a photo
4. The photo upload should now work!

## Bucket Configuration

### File Size Limit
- **Default**: 5MB per file
- To change, modify this line in the SQL script:
  ```sql
  5242880,  -- 5MB in bytes (5 * 1024 * 1024)
  ```

### Allowed File Types
- **Default**: JPEG, JPG, PNG, WebP
- To add more types (e.g., GIF), modify:
  ```sql
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  ```

### Upload Path Format
Your app uploads files using this pattern:
```
{user_id}/company_{company_id}_{client_name}_{timestamp}.jpg
```

Example:
```
10e2ea5b-fdf8-4c94-9a37-fd68f544e0ce/company_1_john_doe_1733731200000.jpg
```

## Troubleshooting

### If Upload Still Fails

1. **Run the troubleshooting script**:
   - Open `troubleshoot_client_photos_bucket.sql`
   - Run it in Supabase SQL Editor
   - Check the output to see what's missing

2. **Check bucket exists**:
   ```sql
   SELECT * FROM storage.buckets WHERE id = 'client-photos';
   ```
   If this returns no rows, the bucket wasn't created. Run the creation script again.

3. **Check policies exist**:
   ```sql
   SELECT policyname FROM pg_policies 
   WHERE tablename = 'objects' AND schemaname = 'storage';
   ```
   You should see at least 4 policies related to client photos.

4. **Reset and start over**:
   - If things are broken, use the RESET section in `troubleshoot_client_photos_bucket.sql`
   - Uncomment the DROP and DELETE statements
   - Run the script
   - Then run the creation script again

### Common Issues

**Issue**: "Permission denied"
- **Solution**: Make sure you're logged in as an authenticated user in your app
- **Solution**: Check that your user has a valid `company_id` in the profiles table

**Issue**: "File too large"
- **Solution**: Increase the `file_size_limit` in the bucket settings or compress the image

**Issue**: "Invalid file type"
- **Solution**: Make sure you're uploading JPEG, PNG, or WebP files only

**Issue**: "Path already exists"
- **Solution**: The file name is not unique. The app should handle this automatically with timestamps.

## Security Notes

### Simple Setup (Option A)
- ✅ Any authenticated user can upload/view/delete photos
- ⚠️ No company-level isolation in storage policies
- ✅ Company filtering happens at the clients table level
- 👍 Good for: Development, testing, small teams

### Secure Setup (Option B)
- ✅ Users can only upload to their own folder
- ✅ Users can only view photos from their company
- ✅ Admins have full access to their company's photos
- ✅ Company-level isolation enforced at storage level
- 👍 Good for: Production, multi-tenant, enterprise

## Next Steps

After setting up the bucket:

1. ✅ Test uploading a client photo
2. ✅ Verify the photo displays correctly in the client list
3. ✅ Test the War Room map with client photos
4. 📸 Consider adding photo compression on the frontend to reduce file sizes
5. 🗺️ Photos with GPS metadata can auto-populate client locations for the War Room

## Additional Resources

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Storage RLS Policies](https://supabase.com/docs/guides/storage/security/access-control)
- [File Upload Best Practices](https://supabase.com/docs/guides/storage/uploads)

