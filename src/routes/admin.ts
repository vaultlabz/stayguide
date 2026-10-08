import express from 'express';
import path from 'path';
import { AuthController } from '../controllers/AuthController';
import { CompanyController } from '../controllers/CompanyController';
import { BillingPlanController } from '../controllers/BillingPlanController';
import { HelpdeskController } from '../controllers/HelpdeskController'; // 2026-10-07 16:00
import { runOpsChecks } from '../jobs/ops-scheduler'; // 2026-10-08 07:50, G7 Ops
import { CompanyService } from '../services/CompanyService'; // 2026-10-08 11:40, G7 S8 metrics
import { WorkerService } from '../services/WorkerService';
import { WorkOrderService } from '../services/WorkOrderService';
import { ScheduleService } from '../services/ScheduleService';
import { entitlementsFor, countActiveProperties } from '../services/EntitlementService';
import { OPS_ADDON } from '../config/plans';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';

const router = express.Router();
const authController = new AuthController();
const companyController = new CompanyController();
const billingPlanController = new BillingPlanController();
const helpdeskController = new HelpdeskController();

// Main admin login
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin-login.html'));
});

router.post('/login', authController.adminLogin.bind(authController));

// Logout
router.post('/logout', authenticateToken, authController.logout.bind(authController));

// Profile
router.get('/profile', authenticateToken, authController.profile.bind(authController));

// Main admin dashboard (served without auth, JS handles auth check)
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin-dashboard.html'));
});

// Admin billing dashboard
router.get('/billing', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin-billing.html'));
});

// Invoice detail page
router.get('/invoice/:invoiceId', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/invoice-detail.html'));
});

// 2026-10-07 16:00, helpdesk inbox page (served without auth, JS handles auth like the dashboard)
router.get('/helpdesk', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin-helpdesk.html'));
});

// Protected routes - require super admin authentication
router.use(authenticateToken, requireSuperAdmin);

// 2026-10-03 23:06, G3 hardware order fulfilment
router.get('/hardware-orders', billingPlanController.listOrders.bind(billingPlanController));
router.put('/hardware-orders/:id', billingPlanController.updateOrder.bind(billingPlanController));

// Companies management API
// 2026-10-07 15:40, dashboard stat tiles
router.get('/stats', companyController.getStats.bind(companyController));
router.get('/companies', companyController.getAllCompanies.bind(companyController));
router.post('/companies', companyController.createCompany.bind(companyController));
router.get('/companies/:id', companyController.getCompany.bind(companyController));
router.put('/companies/:id', companyController.updateCompany.bind(companyController));
router.delete('/companies/:id', companyController.deleteCompany.bind(companyController));

// Billing overview
router.get('/billing', (req, res) => {
  res.json({ message: 'Global Billing Overview - Protected' });
});

// 2026-10-08 07:50, G7 Ops: run the scheduled checks now (they also run hourly on their own)
router.post('/ops/run-checks', async (req, res) => {
  try {
    // tests can simulate a later time (e.g. "unassigned for 24 h"); never in production
    const simulated = process.env.NODE_ENV !== 'production' && req.body?.now ? new Date(String(req.body.now)) : null;
    res.json(await runOpsChecks(simulated && !isNaN(+simulated) ? simulated : new Date()));
  } catch (error) { console.error('Ops checks failed:', error); res.status(500).json({ error: 'Checks failed' }); }
});

// 2026-10-08 11:40, G7 Ops stage 8: adoption + workload per company with the Ops add-on
router.get('/ops/metrics', async (req, res) => {
  try {
    const companies = (await new CompanyService().getAllCompanies()).filter(c => c.status === 'active' && entitlementsFor(c).ops);
    const workers = new WorkerService(), orders = new WorkOrderService(), schedules = new ScheduleService();
    const now = Date.now(), month = 30 * 86400000;
    const rows = await Promise.all(companies.map(async c => {
      const [members, list, sched, properties] = await Promise.all([workers.listMembers(c.id), orders.list(c.id), schedules.list(c.id), countActiveProperties(c.id)]);
      const open = list.filter(o => ['new', 'assigned', 'awaiting_approval', 'in_progress'].includes(o.status));
      return {
        id: c.id, name: c.name, slug: c.slug, properties,
        workers: members.filter(m => m.status === 'active').length,
        open: open.length, overdue: open.filter(o => o.due_at && +new Date(o.due_at) < now).length,
        verified_30d: list.filter(o => o.status === 'verified' && now - +new Date(o.updated_at) < month).length,
        schedules: sched.filter(s => s.active).length
      };
    }));
    const price = OPS_ADDON.price.month;
    const properties = rows.reduce((s, r) => s + r.properties, 0);
    res.json({ companies: rows, totals: { companies: rows.length, properties, workers: rows.reduce((s, r) => s + r.workers, 0), open: rows.reduce((s, r) => s + r.open, 0),
      overdue: rows.reduce((s, r) => s + r.overdue, 0), monthly_revenue: price === null ? null : Math.round(properties * price * 100) / 100 }, price_per_property: price });
  } catch (error) {
    console.error('Ops metrics failed:', error);
    res.status(500).json({ error: 'Failed to load Ops metrics' });
  }
});

// 2026-10-07 16:00, helpdesk API (replaces the JSON placeholder)
router.get('/helpdesk/tickets', helpdeskController.adminList.bind(helpdeskController));
router.get('/helpdesk/tickets/:ticketId', helpdeskController.adminGet.bind(helpdeskController));
router.post('/helpdesk/tickets/:ticketId/replies', helpdeskController.adminReply.bind(helpdeskController));
router.put('/helpdesk/tickets/:ticketId/status', helpdeskController.adminSetStatus.bind(helpdeskController));

export = router;