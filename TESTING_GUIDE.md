# 🧪 StayGuide Mock Database Testing Guide

## 🎯 Mock Database Mode is NOW ACTIVE!

The application is running with **mock database mode** - you can now test the complete functionality without MySQL!

## 🔑 **Test Credentials (Working Now!)**

### **Platform Admin:**
- **URL:** `http://localhost:3002/admin/login`
- **Email:** `admin@stayguide.com`
- **Password:** `admin123`

### **Demo Company Admin:**
- **URL:** `http://localhost:3002/company/demo-rentals/login`
- **Email:** `admin@demorentals.com`
- **Password:** `demo123`

## 🚀 **What You Can Test Right Now:**

### **1. Complete Authentication Flow**
✅ Login with real credentials  
✅ JWT token generation and storage  
✅ Protected route access  
✅ Dashboard redirects working  

### **2. Admin Dashboard**
✅ Companies list (shows 2 demo companies)  
✅ Company statistics  
✅ Create new company functionality  
✅ Company management operations  

### **3. Company Dashboard**
✅ Property list (shows 2 demo properties)  
✅ Property statistics and costs  
✅ Create new property functionality  
✅ Property management operations  

### **4. Tablet App API**
✅ Property content retrieval  
✅ Restaurant recommendations  
✅ Local information  
✅ Announcements  

## 🎮 **Step-by-Step Testing:**

### **Test 1: Admin Login & Dashboard**
1. Go to: `http://localhost:3002/admin/login`
2. Login with: `admin@stayguide.com` / `admin123`
3. **Should work!** - Dashboard shows 2 companies
4. Try creating a new company
5. View company details

### **Test 2: Company Login & Dashboard**  
1. Go to: `http://localhost:3002/company/demo-rentals/login`
2. Login with: `admin@demorentals.com` / `demo123`
3. **Should work!** - Dashboard shows 2 properties
4. Try creating a new property
5. View property details

### **Test 3: Property Content API**
<!-- 2026-10-03 11:43, content API is no longer public; tablets must be paired -->
1. Log in to the company dashboard (`/company/demo-rentals/login`, `admin@demorentals.com` / `demo123`)
2. Edit **Seaside Villa** → **Tablets** → **Pair new tablet** and note the 6-digit code
3. In another browser window open `http://localhost:3002/tablet` and enter the code
4. **Should show** the property page (Wi-Fi, amenities, restaurants, local info)
5. Admin preview without pairing: **View Tablet** on the dashboard (uses your dashboard login)
6. Visiting `/company/demo-rentals/property/seaside-villa/api/content` without logging in **should return 401**

### **Test 4: Authentication Security**
1. Try accessing protected URLs without login
2. Should redirect to login pages
3. Test logout functionality

## 📊 **Mock Data Included:**

### **Companies:**
- Demo Rentals LLC (demo-rentals)
- Ocean View Properties (ocean-view)

### **Properties:**
- Seaside Villa (demo-rentals)
- Mountain Cabin (demo-rentals)

### **Content:**
- Restaurant recommendations
- Local attractions
- How-to videos
- Property announcements

## 🔄 **For Production Deployment:**

When ready to deploy to Plesk:
1. Change `.env`: `MOCK_DATABASE=false`
2. Set up real MySQL database in Plesk
3. Run database schema and init scripts
4. Update database credentials

## 🐛 **If Something Doesn't Work:**

1. **Check browser console** (F12) for errors
2. **Clear localStorage** if authentication issues
3. **Refresh page** if data doesn't load
4. **Check server logs** for mock database messages

---

**🎉 The complete StayGuide platform is now fully functional for testing!**