# Profile Persistence Testing Guide

## 🎯 What Was Fixed

### Problem
- Profile data wasn't persisting on p3lending.space
- Values reverted to defaults on page refresh
- No way to change password or email

### Solution Implemented
1. Created `ProfileService` that calls local auth server REST API
2. Updated `PersistenceService` to use ProfileService
3. Added `/api/auth/change-email` endpoint to local-auth-server
4. Added password and email change UI to ProfileSettings component

---

## ✅ Testing Checklist

### 1. Test Profile Persistence

1. **Navigate to Profile Settings**
   - Go to https://p3lending.space
   - Login with your credentials
   - Click on Profile/Settings tab

2. **Update Profile Fields**
   - Change your display name
   - Update employment title
   - Modify annual income
   - Update financial bio
   - Click "Save Profile"

3. **Verify Persistence**
   - Wait for success message
   - Refresh the page (Ctrl+R or F5)
   - ✅ **EXPECTED**: All your changes should remain
   - ❌ **BEFORE**: Changes would revert to defaults

### 2. Test Password Change

1. **Open Password Change Section**
   - In Profile Settings, find "Change Password" section
   - Click "Change Password" button

2. **Change Your Password**
   - Enter your current password
   - Enter a new password (minimum 8 characters)
   - Confirm new password
   - Click "Update Password"

3. **Verify Password Change**
   - Wait for success message
   - Logout
   - Try logging in with OLD password → Should FAIL
   - Login with NEW password → Should SUCCEED ✅

### 3. Test Email Change

1. **Open Email Change Section**
   - In Profile Settings, find "Change Email" section
   - Click "Change Email" button

2. **Request Email Change**
   - Enter your new email address
   - Enter your password for confirmation
   - Click "Update Email"

3. **Verify Email Change**
   - ✅ Success message appears
   - Check MailHog at https://mail.p3lending.space (port 8025)
   - Find confirmation email sent to new address
   - Click confirmation link (or copy token)
   - Complete email verification

---

## 🔍 Debugging

### Check Services Status

```bash
# Check if local auth server is running
lsof -i :5001

# Check if frontend is running
lsof -i :5173

# Check if MailHog is running
lsof -i :8025

# View auth server logs
tail -f ~/P3_Official/P3-Lending-Protocol/auth-api.log
```

### Check Database

```bash
# Connect to PostgreSQL
psql -U p3user -d p3lending

# View profiles table
SELECT id, display_name, email, employment_title, annual_income 
FROM public.profiles 
LIMIT 5;

# View auth users
SELECT id, email, email_confirmed_at, last_sign_in_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;
```

### Check Browser Console

1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for:
   - `[ProfileService] Profile saved successfully`
   - Any error messages in red
   - Network requests to `/api/profile/:userId`

### Check LocalStorage

```javascript
// In browser console
localStorage.getItem('p3_auth_token')
localStorage.getItem('p3_user_profile')
```

---

## 🐛 Common Issues

### "Not authenticated" error
- **Cause**: JWT token expired or missing
- **Fix**: Logout and login again

### "Failed to update profile" error
- **Cause**: Database connection issue or invalid data
- **Fix**: Check if PostgreSQL is running: `systemctl status postgresql`

### Profile updates but doesn't persist
- **Cause**: API endpoint not being called
- **Fix**: Check browser console for errors, verify `/api/profile/:userId` is being called

### Password change says "Current password is incorrect"
- **Cause**: Wrong current password or bcrypt hash mismatch
- **Fix**: Try resetting password or check database password hash

### Email confirmation not received
- **Cause**: MailHog not running or SMTP configuration issue
- **Fix**: Check MailHog at http://localhost:8025 or restart it

---

## 📝 API Endpoints Reference

### Profile Operations
- **GET** `/api/profile/:userId` - Load user profile
- **PUT** `/api/profile/:userId` - Update user profile

### Security Operations
- **POST** `/api/auth/change-password` - Change password
  ```json
  {
    "current_password": "oldpass123",
    "new_password": "newpass456"
  }
  ```

- **POST** `/api/auth/change-email` - Change email
  ```json
  {
    "new_email": "newemail@example.com",
    "password": "currentpass123"
  }
  ```

### Authentication
- **POST** `/api/auth/login` - Login
- **POST** `/api/auth/register` - Register
- **GET** `/api/auth/user` - Get current user (requires token)

---

## 🚀 Next Steps

After testing, if issues persist:

1. **Check AGENT.md** for troubleshooting context
2. **Review auth server logs** for API errors
3. **Inspect database** to verify data is being written
4. **Check browser Network tab** to see if API calls are succeeding

---

*Last Updated: 2026-09-21*
