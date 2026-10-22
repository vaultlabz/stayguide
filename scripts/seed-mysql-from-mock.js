// 2026-10-08 11:45, #45: reset a MySQL database to the same demo data mock mode starts with, so the e2e suites can run
// against real MySQL (MOCK_DATABASE=false) with the same logins, ids and properties.
//   npm run build && node scripts/seed-mysql-from-mock.js            (uses DB_* from .env; refuses unless DB_NAME ends in _dev or _test)
// Drops and recreates DB_NAME from database/schema.sql, then inserts every non-empty mock array into its table.
// Columns the table doesn't have are skipped; arrays/objects are stored as JSON.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const mock = { ...require('../dist/utils/mock-database'),
  ...require('../dist/services/MockBillingService'), ...require('../dist/services/MockIntegratedReportService') }; // invoices + guest reports live there

const ROOT = path.resolve(__dirname, '..');
const DB = process.env.DB_NAME;
const TABLES = {
  mockUsers: 'users', mockCompanies: 'companies', mockProperties: 'properties', mockAmenities: 'amenities',
  mockRestaurants: 'restaurants', mockAnnouncements: 'announcements', mockVideos: 'howto_videos', mockLocalInfo: 'local_info',
  mockPropertyContent: 'property_content', mockCompanyWorkers: 'company_workers', mockWorkOrders: 'work_orders',
  mockChecklistTemplates: 'checklist_templates', mockChecklistTemplateItems: 'checklist_template_items',
  mockMaintenanceSchedules: 'maintenance_schedules', mockWorkOrderEvents: 'work_order_events',
  mockBillingRecords: 'billing', mockGuestReports: 'guest_reports'
};

const value = v => v === undefined ? null : (v && typeof v === 'object' && !(v instanceof Date)) ? JSON.stringify(v) : v;

(async () => {
  if (!/_(dev|test)$/.test(DB || '')) throw new Error(`refusing to reset DB_NAME=${DB} (must end in _dev or _test)`);
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '', multipleStatements: true });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${DB}\`; CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4; USE \`${DB}\`;`);
    await conn.query(fs.readFileSync(path.join(ROOT, 'database/schema.sql'), 'utf8'));
    await conn.query('SET FOREIGN_KEY_CHECKS = 0; DELETE FROM users;'); // schema.sql inserts a placeholder super admin; the mock one replaces it
    for (const [name, table] of Object.entries(TABLES)) {
      const rows = mock[name] || [];
      if (!rows.length) continue;
      const [cols] = await conn.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [DB, table]);
      const have = new Set(cols.map(c => c.COLUMN_NAME));
      for (const row of rows) {
        const keys = Object.keys(row).filter(k => have.has(k));
        await conn.query(`INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (?)`, [keys.map(k => value(row[k]))]);
      }
      console.log(`${table}: ${rows.length}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end();
  }
})().catch(err => { console.error('seed failed:', err.message); process.exit(1); });
