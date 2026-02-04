# Deploy Create-Executive Edge Function

## 🚨 Issue
You're getting a CORS error because the `create-executive` Edge Function hasn't been deployed to your Supabase project yet.

## ✅ Solution: Deploy the Function

### Option 1: Via Supabase Dashboard (Easiest)

1. **Go to Supabase Dashboard**: https://app.supabase.com
2. **Select your project**: Click on your project name
3. **Navigate to Edge Functions**:
   - Click on "Edge Functions" in the left sidebar
4. **Deploy the function**:
   - Click the **"Deploy new function"** button
   - Select **"Deploy from local file"** or use the CLI instructions provided
   - Function name: `create-executive`
   - Browse and select the entire `supabase/functions/create-executive` folder
   - Click **"Deploy"**

### Option 2: Via Supabase CLI

#### Step 1: Install Supabase CLI (if not installed)
```bash
npm install -g supabase
```

#### Step 2: Login to Supabase
```bash
npx supabase login
```

#### Step 3: Link your project
```bash
npx supabase link --project-ref esczjigrxpwjyqlsbkrk
```

#### Step 4: Deploy the function
```bash
npx supabase functions deploy create-executive
```

### Option 3: Quick Deploy (Using npx)

Open your terminal in the project folder and run:

```bash
npx supabase functions deploy create-executive --project-ref esczjigrxpwjyqlsbkrk
```

---

## 🔍 Verify Deployment

After deploying, verify it's working:

1. Go to your Supabase Dashboard
2. Click **Edge Functions** in the left sidebar
3. You should see `create-executive` listed
4. Check the **Status** - it should be "Active" or "Deployed"

---

## 🧪 Test After Deployment

1. **Refresh your browser** (clear cache: Ctrl+Shift+R)
2. **Open the Executive Account page**
3. **Click "Add Executive"**
4. The companies should now load in the checkboxes
5. Fill in the form and click "Create Account"
6. It should work without CORS errors!

---

## 🆘 Still Not Working?

If you still get errors after deployment:

1. **Check Edge Function Logs**:
   - In Supabase Dashboard → Edge Functions → `create-executive` → Logs
   - Look for any error messages

2. **Verify Environment Variables**:
   - Make sure your `SUPABASE_SERVICE_ROLE_KEY` is set in the Edge Function environment

3. **Check Browser Console**:
   - Open DevTools (F12)
   - Check Console for detailed error messages
   - Check Network tab for the actual response from the function

---

## 📝 What the Function Does

The `create-executive` Edge Function:
- ✅ Verifies you're a system administrator
- ✅ Validates all input fields
- ✅ Checks company IDs exist
- ✅ Creates the executive user in Supabase Auth
- ✅ Creates the profile with `role = 'executive'`
- ✅ Creates company assignments
- ✅ Handles rollback if anything fails

---

## 🎯 Next Steps

1. Deploy the function using one of the options above
2. Refresh your browser
3. Try creating an executive account
4. If it works, you're done! 🎉
5. If not, check the logs and let me know the error message
