# StayGuide Plesk Deployment Guide

## 📋 Pre-Deployment Checklist

### 1. Domain & Hosting Setup
- ✅ Domain pointed to Plesk server
- ✅ SSL certificate installed
- ✅ Node.js enabled in Plesk
- ✅ MySQL database created

### 2. Email Configuration
- ✅ Email accounts created (billing@yourdomain.com)
- ✅ SMTP settings configured
- ✅ Test email sending works

## 🚀 Deployment Steps

### Step 1: Upload Files
1. Build the project locally:
   ```bash
   npm run build
   ```

2. Upload the following files/folders to your Plesk domain:
   ```
   /dist/           (compiled JavaScript)
   /package.json
   /package-lock.json
   /.env.production (configured from template)
   ```

### Step 2: Configure Environment
1. Copy `.env.production.example` to `.env.production`
2. Update the production environment variables:

```bash
# Required Production Settings
NODE_ENV=production
PORT=3000  # Plesk will assign the actual port

# Database (MySQL in Plesk)
MOCK_DATABASE=false
DB_HOST=localhost
DB_USER=your_plesk_db_user
DB_PASSWORD=your_plesk_db_password
DB_NAME=your_plesk_db_name

# Email (Domain SMTP)
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=billing@yourdomain.com
SMTP_PASS=your_email_password
FROM_EMAIL=billing@yourdomain.com
APP_BASE_URL=https://yourdomain.com
```

### Step 3: Database Setup
1. Import the database schema:
   ```sql
   # Upload and run: /database/schema.sql
   # Upload and run: /database/init.sql (if needed)
   ```

2. Verify database connection:
   ```bash
   node -e "console.log('DB Test:', process.env.DB_HOST)"
   ```

### Step 4: Install Dependencies
```bash
npm install --production
```

### Step 5: Start Application
In Plesk Node.js settings:
- **Startup File**: `dist/index.js`
- **Application Mode**: `production`
- **Environment Variables**: Load from `.env.production`

## 📧 Email Configuration

### Option 1: Domain SMTP (Recommended)
```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=billing@yourdomain.com
SMTP_PASS=your_email_password
```

### Option 2: Plesk Local SMTP
```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_SECURE=false
SMTP_USER=billing@yourdomain.com
SMTP_PASS=your_email_password
```

### Option 3: External SMTP (Gmail/Office365)
```bash
# For Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password

# For Office365
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your_email@outlook.com
SMTP_PASS=your_password
```

## 🔧 Production Optimizations

### 1. Add Nodemailer Package
When deploying to production, install the email package:
```bash
npm install nodemailer @types/nodemailer
```

Then uncomment the SMTP implementation in `/src/services/EmailService.ts`

### 2. Environment Security
- Never commit `.env.production` to git
- Use strong passwords and JWT secrets
- Rotate secrets regularly

### 3. SSL Configuration
Ensure HTTPS is working:
```bash
APP_BASE_URL=https://yourdomain.com
```

### 4. Database Optimization
- Enable MySQL query caching
- Set up regular backups
- Monitor database performance

## 📊 Testing Production Deployment

### 1. Health Check
```bash
curl https://yourdomain.com/api/health
```

### 2. Admin Login Test
```bash
curl -X POST https://yourdomain.com/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"your_password"}'
```

### 3. Email Test
Create a new invoice and verify email is sent:
```bash
# Check server logs for SMTP email sending
tail -f /var/log/nodejs/your-app.log
```

## 🚨 Troubleshooting

### Issue: Email Not Sending
1. Check SMTP credentials
2. Verify email account exists
3. Test SMTP connection manually
4. Check firewall/port blocking

### Issue: Database Connection Failed
1. Verify MySQL service running
2. Check database credentials
3. Confirm database exists
4. Test connection with MySQL client

### Issue: Port Conflicts
1. Let Plesk assign port automatically
2. Update APP_BASE_URL if needed
3. Check Plesk Node.js logs

## 📝 Production Checklist

- [ ] Environment variables configured
- [ ] Database schema imported
- [ ] Email accounts created and tested
- [ ] SSL certificate working
- [ ] Admin login working
- [ ] Invoice creation working
- [ ] Email sending working
- [ ] All routes accessible
- [ ] Error logging configured
- [ ] Backup strategy in place

## 🔄 Post-Deployment

### Monitoring
- Set up log rotation
- Monitor email delivery rates
- Track database performance
- Monitor disk space usage

### Maintenance
- Regular database backups
- Security updates
- Performance monitoring
- Email deliverability monitoring

---

**🎉 Your StayGuide platform is now ready for production with full email functionality!**