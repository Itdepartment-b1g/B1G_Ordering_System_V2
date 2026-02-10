# Email Setup Instructions for B1G Ordering System V2

## Problem
The email API (`/api/send-email`) works on Vercel deployment but returns **404 Not Found** when testing locally with Vite dev server.

## Solution
Use **Vercel CLI** for local development to properly simulate the production environment.

---

## Setup Steps

### 1. Install Vercel CLI
```bash
npm install
```

The Vercel CLI has been added to `devDependencies`, so it will be installed automatically.

### 2. Create Environment Variables File

**IMPORTANT**: You need to create a `.env.local` file with your Gmail credentials.

Create a file named `.env.local` in the project root with:

```env
# Gmail Configuration for Email Sending
GMAIL_USERNAME=itdepartment.b1g@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password-here
```

**Replace with your actual credentials:**
- `GMAIL_USERNAME`: Your Gmail address
- `GMAIL_APP_PASSWORD`: The 16-character App Password from Google (NOT your regular password)

> **Note**: The `.env.local` file is already in `.gitignore` so your credentials won't be committed to Git.

### 3. Run Local Development Server

**For local testing WITH email functionality:**
```bash
npm run dev:vercel
```

This will:
- Start Vercel's local development environment
- Serve your frontend on `http://localhost:8081`
- Handle `/api/send-email` requests properly
- Load environment variables from `.env.local`

**For regular frontend development (without email testing):**
```bash
npm run dev
```

---

## For Vercel Deployment

### Set Environment Variables in Vercel Dashboard

1. Go to your Vercel project: https://vercel.com/dashboard
2. Navigate to: **Settings** → **Environment Variables**
3. Add these variables for **Production**, **Preview**, and **Development**:
   - `GMAIL_USERNAME` = `itdepartment.b1g@gmail.com`
   - `GMAIL_APP_PASSWORD` = `your-16-char-app-password`

4. Redeploy your project after adding the variables

---

## How to Get Gmail App Password

If you need to generate a new Gmail App Password:

1. **Enable 2-Factor Authentication** (required):
   - Go to: https://myaccount.google.com/security
   - Enable "2-Step Verification"

2. **Generate App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select app: **Mail**
   - Select device: **Other (Custom name)**
   - Enter: `B1G Ordering System V2`
   - Click **Generate**
   - Copy the 16-character password (remove spaces)

3. **Add to `.env.local`**:
   ```env
   GMAIL_APP_PASSWORD=abcdefghijklmnop
   ```

---

## Testing Email Functionality

### 1. Start the development server:
```bash
npm run dev:vercel
```

### 2. Create a test order in the system

### 3. Check browser console for logs:
```
📧 Sending order confirmation email to: client@example.com
🚀 Using email API URL: http://localhost:8081/api/send-email
✅ Email sent successfully to client
✅ Receipt email sent successfully to Super Admin and Finance departments
```

### 4. Verify emails were sent:
- Check client's inbox
- Check Super Admin inbox (itdepartment.b1g@gmail.com)
- Check Finance inbox (from database or fallback)

---

## Email Flow

When an order is submitted, 3 parties receive emails:

1. **Client** - Order confirmation with pricing and items
2. **Super Admin** - Internal receipt with payment proof and signature
3. **Finance** - Same internal receipt as Super Admin

> **Note**: Super Admin and Finance receive the SAME email (both are in the "To:" field).

---

## Troubleshooting

### "404 Not Found" on `/api/send-email`
- ❌ You're using `npm run dev` (Vite only)
- ✅ Use `npm run dev:vercel` instead

### "Missing Gmail credentials"
- Check if `.env.local` exists in project root
- Verify variable names are exactly: `GMAIL_USERNAME` and `GMAIL_APP_PASSWORD`
- For deployment: Check Vercel dashboard environment variables

### "Invalid credentials" or "EAUTH" error
- You're using regular Gmail password instead of App Password
- Generate a new App Password (see instructions above)

### Emails not sending in production
- Verify environment variables are set in Vercel dashboard
- Check deployment logs in Vercel for error messages
- Make sure variables are set for the correct environment (Production/Preview)

---

## Summary

✅ **Local Development**: Use `npm run dev:vercel` + `.env.local`  
✅ **Production**: Set environment variables in Vercel dashboard  
✅ **Email Recipients**: Client + Super Admin + Finance (company-specific)  
✅ **Security**: Use Gmail App Password, never commit `.env.local` to Git  

---

## Quick Commands Reference

```bash
# Install dependencies
npm install

# Local development with email support
npm run dev:vercel

# Local development without email (frontend only)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```
