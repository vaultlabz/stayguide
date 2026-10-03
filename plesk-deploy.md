# Plesk Deployment Guide

## Prerequisites
1. Node.js environment set up in Plesk
2. MySQL database created in Plesk
3. Domain/subdomain configured

## Deployment Steps

### 1. Upload Files
Upload all project files to the httpdocs directory

### 2. Install Dependencies
```bash
cd httpdocs
npm install --production
```

### 3. Environment Configuration
- Copy `.env.production` to `.env`
- Update database credentials from Plesk MySQL settings
- Update JWT_SECRET with a secure production key
- PORT will be automatically set by Plesk

### 4. Database Setup
- Create database in Plesk MySQL
- Run database migration script (to be created)

### 5. Build Application
```bash
npm run build
```

### 6. Configure Plesk Node.js
- Set startup file: `dist/index.js`
- Set environment variables in Plesk Node.js settings
- Plesk will automatically assign PORT

### 7. Start Application
The application will start automatically through Plesk Node.js management

## Important Notes
- PORT is dynamically assigned by Plesk - do not hardcode
- Use environment variables for all configuration
- Ensure MySQL credentials match Plesk database settings
- SSL certificates should be managed through Plesk