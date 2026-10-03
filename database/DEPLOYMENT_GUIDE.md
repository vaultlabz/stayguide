# StayGuide Database Deployment Guide for Plesk

## 📋 Pre-Deployment Checklist

### 1. Plesk MySQL Database Setup
1. **Log into Plesk Control Panel**
2. **Navigate to Databases**
3. **Create New Database:**
   - Database Name: `stayguide_production` (or your preferred name)
   - Database User: Create dedicated user with full privileges
   - Password: Generate secure password

### 2. Database Schema Installation
Execute the following SQL files in order:

#### Step 1: Create Schema
Run `database/schema.sql` in Plesk phpMyAdmin or SQL interface

#### Step 2: Initialize with Sample Data (Optional)
Run `database/init.sql` for demo data including:
- Default admin user: `admin@stayguide.com` / `admin123`
- Demo company: `admin@demorentals.com` / `demo123`
- Sample property with content

### 3. Environment Configuration

#### Update `.env` file with Plesk database credentials:
```env
# Server Configuration - Plesk will set PORT dynamically
NODE_ENV=production

# Database Configuration - Update with your Plesk MySQL details
DB_HOST=localhost
DB_USER=your_plesk_db_user
DB_PASSWORD=your_plesk_db_password
DB_NAME=stayguide_production

# JWT Configuration - Use strong production secret
JWT_SECRET=your_super_secure_production_jwt_secret_here
JWT_EXPIRES_IN=7d

# Admin Configuration
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=secure_admin_password
```

### 4. File Upload to Plesk
Upload these files to your domain's `httpdocs` directory:
- All application files
- `database/` folder with SQL files
- Updated `.env` file with production settings

### 5. Plesk Node.js Configuration
1. **Set Node.js version** (recommend Node.js 18+)
2. **Set startup file:** `dist/index.js`
3. **Set environment variables** in Plesk Node.js settings
4. **Install dependencies:** Plesk will run `npm install`

### 6. SSL Certificate (Recommended)
Enable SSL certificate through Plesk for HTTPS access

## 🔐 Default Login Credentials (Change After Setup)

### Platform Admin:
- **URL:** `https://yourdomain.com/admin/login`
- **Email:** `admin@stayguide.com`
- **Password:** `admin123`

### Demo Company Admin:
- **URL:** `https://yourdomain.com/company/demo-rentals/login`
- **Email:** `admin@demorentals.com`
- **Password:** `demo123`

## 🧪 Testing After Deployment

### 1. Health Check
`https://yourdomain.com/api/health`
Should return JSON with database: "connected"

### 2. Admin Login Test
- Navigate to admin login
- Use default credentials
- Verify dashboard loads with companies list

### 3. Company Login Test
- Navigate to demo company login
- Use demo credentials
- Verify property management works

### 4. Create Test Company
- Login as admin
- Create new company through dashboard
- Test company admin login

## 🚨 Security Checklist

### Immediate Actions After Deployment:
1. **Change default admin password**
2. **Update JWT_SECRET** to secure random string
3. **Review database user permissions**
4. **Enable SSL/HTTPS**
5. **Set up database backups in Plesk**

### Ongoing Security:
- Regular password updates
- Monitor login attempts
- Keep Node.js and dependencies updated
- Regular database backups

## 📊 Monitoring

### Database Performance
- Monitor connection count in Plesk
- Watch for slow queries
- Set up automated backups

### Application Performance
- Monitor Node.js memory usage in Plesk
- Check error logs regularly
- Monitor disk space usage

## 🆘 Troubleshooting

### Common Issues:

#### "Database connection failed"
- Check DB credentials in `.env`
- Verify database user has proper privileges
- Confirm database name exists in Plesk

#### "Port already in use"
- Plesk automatically assigns ports
- Don't hardcode PORT in production

#### "File not found" errors
- Ensure all files uploaded to httpdocs
- Check file permissions
- Verify build completed successfully

#### Authentication not working
- Verify JWT_SECRET is set
- Check user exists in database
- Confirm password hashes match

## 📞 Support

For deployment issues:
1. Check Plesk error logs
2. Review Node.js application logs
3. Verify database connectivity
4. Check file permissions and uploads

---

**Note:** This setup creates a complete multi-tenant SaaS platform ready for production use with proper security and scalability considerations.