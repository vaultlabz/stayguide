import express from 'express';
import path from 'path';
import { AuthController } from '../controllers/AuthController';
import { PropertyController } from '../controllers/PropertyController';
import { DeviceController } from '../controllers/DeviceController';
import { ContentController } from '../controllers/ContentController';
import { GuestLinkController } from '../controllers/GuestLinkController';
import { PresenceController } from '../controllers/PresenceController'; // 2026-10-10 10:28, #62
import { BillingPlanController } from '../controllers/BillingPlanController';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { HelpdeskController } from '../controllers/HelpdeskController'; // 2026-10-07 16:00
import { OpsController } from '../controllers/OpsController'; // 2026-10-07 19:00, G7 Ops
import { WorkOrderController } from '../controllers/WorkOrderController'; // 2026-10-07 22:40, G7 S2
import { OnSiteController } from '../controllers/OnSiteController'; // 2026-10-08 01:10, G7 S3
import { ChecklistController } from '../controllers/ChecklistController'; // 2026-10-08 03:20, G7 S4
import { TimeController } from '../controllers/TimeController'; // 2026-10-08 09:30, G7 S7
import { ScheduleController } from '../controllers/ScheduleController'; // 2026-10-08 11:30, G7 S8
import { CompanyAdminsController } from '../controllers/CompanyAdminsController'; // 2026-10-09 12:28, #61
import { authenticateToken, requireCompanyAdmin } from '../middleware/auth';
import { uploadPropertyImage, uploadAmenityImage } from '../middleware/upload';

interface CompanyParams {
  companySlug: string;
}

interface PropertyParams extends CompanyParams {
  propertySlug: string;
}

const router = express.Router({ mergeParams: true });
const authController = new AuthController();
const propertyController = new PropertyController();
const deviceController = new DeviceController();
const contentController = new ContentController();
const guestLinkController = new GuestLinkController();
const presenceController = new PresenceController(); // 2026-10-10 10:28, #62
const billingPlanController = new BillingPlanController();
const analyticsController = new AnalyticsController();
const helpdeskController = new HelpdeskController();
const opsController = new OpsController();
const workOrderController = new WorkOrderController();
const onSiteController = new OnSiteController();
const checklistController = new ChecklistController();
const companyAdminsController = new CompanyAdminsController(); // 2026-10-09 12:28, #61
const timeController = new TimeController();
const scheduleController = new ScheduleController();

// Company admin login
router.get('/login', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-login.html'));
});

router.post('/login', authController.companyLogin.bind(authController));

// Logout
router.post('/logout', authenticateToken, authController.logout.bind(authController));

// Profile
router.get('/profile', authenticateToken, authController.profile.bind(authController));

// 2026-10-03 11:39, tablet preview for company admins. Guests use paired devices at /tablet;
// the page HTML is static, and its content API now requires a company-admin JWT.
router.get('/property/:propertySlug', (req: express.Request<PropertyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/tablet-app.html'));
});

router.get('/property/:propertySlug/api/content', authenticateToken, requireCompanyAdmin, propertyController.getPropertyContent.bind(propertyController));

router.get('/property/:propertySlug/api/weather', authenticateToken, requireCompanyAdmin, propertyController.getPropertyWeather.bind(propertyController));

// Company dashboard (served without auth, JS handles auth check)
router.get('/dashboard', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-dashboard.html'));
});

// Company billing dashboard
router.get('/billing', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-billing.html'));
});

// 2026-10-07 16:00, helpdesk + help guide pages (served without auth, JS handles auth like the dashboard)
router.get('/helpdesk', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-helpdesk.html'));
});
router.get('/help', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-help.html'));
});
// 2026-10-07 22:40, G7 S2: work order board
router.get('/ops', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-ops.html'));
});
// 2026-10-08 11:30, G7 S8: schedules page
router.get('/schedules', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-schedules.html'));
});
// 2026-10-08 09:30, G7 S7: time & pay page
router.get('/time', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-time.html'));
});
// 2026-10-08 03:20, G7 S4: checklist templates page
router.get('/checklists', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-checklists.html'));
});
// 2026-10-08 01:10, G7 S3: printable QR sticker page
router.get('/ops/qr/:propertyId', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-ops-qr.html'));
});
// 2026-10-07 19:00, G7 Ops: Team page (workers + invites)
router.get('/team', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-team.html'));
});

// Protected routes - require company admin authentication
router.use(authenticateToken, requireCompanyAdmin);

router.get('/geocode', propertyController.geocode.bind(propertyController));

// Properties management API
router.get('/properties', propertyController.getPropertiesByCompany.bind(propertyController));
router.post('/properties', propertyController.createProperty.bind(propertyController));
router.get('/properties/:propertySlug', propertyController.getProperty.bind(propertyController));
router.put('/properties/:propertySlug', propertyController.updateProperty.bind(propertyController));
router.delete('/properties/:propertySlug', propertyController.deleteProperty.bind(propertyController));

// Amenities management API
router.get('/properties/:propertySlug/amenities', propertyController.getAmenitiesByProperty.bind(propertyController));
router.post('/properties/:propertySlug/amenities', propertyController.createAmenity.bind(propertyController));
router.put('/properties/:propertySlug/amenities/:amenityId', propertyController.updateAmenity.bind(propertyController));
router.delete('/properties/:propertySlug/amenities/:amenityId', propertyController.deleteAmenity.bind(propertyController));

// 2026-10-03 22:25, G1 guide content (restaurants, videos, local info, announcements, welcome)
// NOTE: /order must be registered before /:id
router.get('/properties/:propertySlug/content', contentController.getAll.bind(contentController));
router.post('/properties/:propertySlug/content/:type', contentController.create.bind(contentController));
router.put('/properties/:propertySlug/content/:type/order', contentController.reorder.bind(contentController));
router.put('/properties/:propertySlug/content/:type/:id', contentController.update.bind(contentController));
router.delete('/properties/:propertySlug/content/:type/:id', contentController.remove.bind(contentController));
router.put('/properties/:propertySlug/welcome', contentController.setWelcome.bind(contentController));

// 2026-10-04 00:26, G4 section analytics
router.get('/analytics/summary', analyticsController.companySummary.bind(analyticsController));
router.get('/properties/:propertySlug/analytics', analyticsController.propertySummary.bind(analyticsController));

// 2026-10-03 23:06, G3 self-serve billing (Stripe)
router.get('/billing/status', billingPlanController.status.bind(billingPlanController));
router.post('/billing/checkout', billingPlanController.checkout.bind(billingPlanController));
router.post('/billing/invoice', billingPlanController.invoice.bind(billingPlanController));
router.post('/billing/hardware', billingPlanController.hardware.bind(billingPlanController));
router.post('/billing/portal', billingPlanController.portal.bind(billingPlanController));
router.post('/billing/ops', billingPlanController.ops.bind(billingPlanController)); // 2026-10-08 12:50, G7 S9

// 2026-10-03 22:42, G2 public phone/web guide link
router.get('/properties/:propertySlug/guest-link', guestLinkController.get.bind(guestLinkController));
// 2026-10-10 10:28, #62 presence: guest activity + crew on site, precise property spot
router.get('/presence', presenceController.overview.bind(presenceController));
router.put('/properties/:propertySlug/site', presenceController.setSite.bind(presenceController));
router.post('/properties/:propertySlug/guest-link/rotate', guestLinkController.rotate.bind(guestLinkController));

// 2026-10-03 11:39, paired tablets per property
router.post('/properties/:propertySlug/devices/pairing-code', deviceController.createPairingCode.bind(deviceController));
router.get('/properties/:propertySlug/devices', deviceController.listDevices.bind(deviceController));
router.delete('/properties/:propertySlug/devices/:deviceId', deviceController.revokeDevice.bind(deviceController));

// 2026-10-03 12:32, direct-booking / review QR scan counts
router.get('/properties/:propertySlug/link-stats', propertyController.getLinkStats.bind(propertyController));

// Image upload API
router.post('/upload/property-image', uploadPropertyImage, propertyController.uploadPropertyImage.bind(propertyController));
router.post('/upload/amenity-image', uploadAmenityImage, propertyController.uploadAmenityImage.bind(propertyController));

// Company billing
router.get('/billing', (req: express.Request<CompanyParams>, res) => {
  const { companySlug } = req.params;
  res.json({ message: `${companySlug} Billing - Protected` });
});

// 2026-10-07 16:00, company helpdesk API (replaces the JSON placeholders)
router.get('/helpdesk/tickets', helpdeskController.companyList.bind(helpdeskController));
router.post('/helpdesk/tickets', helpdeskController.companyCreate.bind(helpdeskController));
router.get('/helpdesk/tickets/:ticketId', helpdeskController.companyGet.bind(helpdeskController));
router.post('/helpdesk/tickets/:ticketId/replies', helpdeskController.companyReply.bind(helpdeskController));
router.post('/helpdesk/tickets/:ticketId/close', helpdeskController.companyClose.bind(helpdeskController));

// 2026-10-09 12:28, #61 company admins (every plan; not part of Ops)
router.get('/admins', companyAdminsController.list.bind(companyAdminsController));
router.post('/admins', companyAdminsController.invite.bind(companyAdminsController));
router.put('/admins/:userId', companyAdminsController.setStatus.bind(companyAdminsController));

// 2026-10-07 19:00, G7 Ops stage 1: team (needs the Ops add-on; 402 otherwise)
router.get('/ops/team', opsController.team.bind(opsController));
router.post('/ops/invites', opsController.invite.bind(opsController));
router.post('/ops/invites/:inviteId/resend', opsController.resendInvite.bind(opsController));
router.delete('/ops/invites/:inviteId', opsController.revokeInvite.bind(opsController));
router.put('/ops/workers/:userId', opsController.updateWorker.bind(opsController));
router.put('/ops/workers/:userId/coi', opsController.verifyCertificate.bind(opsController)); // 2026-10-08 07:40, G7 S6

// 2026-10-07 22:40, G7 Ops stage 2: work orders (needs the Ops add-on; 402 otherwise)
// 2026-10-08 11:30, G7 S8: settings also carry the company time zone
router.get('/ops/settings', scheduleController.settings.bind(scheduleController));
router.put('/ops/settings', scheduleController.settings.bind(scheduleController));
router.get('/ops/work-orders', workOrderController.list.bind(workOrderController));
router.post('/ops/work-orders', workOrderController.create.bind(workOrderController));
router.post('/ops/work-orders/from-report/:reportId', workOrderController.fromReport.bind(workOrderController));
router.get('/ops/work-orders/:orderId', workOrderController.detail.bind(workOrderController));
router.put('/ops/work-orders/:orderId', workOrderController.edit.bind(workOrderController));
// 2026-10-08 01:10, G7 Ops stage 3: property access codes, QR stickers, per-job access code (before the generic /:action route)
router.get('/ops/access', onSiteController.accessList.bind(onSiteController));
router.get('/ops/access/:propertyId', onSiteController.accessGet.bind(onSiteController));
router.put('/ops/access/:propertyId', onSiteController.accessSet.bind(onSiteController));
router.get('/ops/access/:propertyId/qr', onSiteController.qrGet.bind(onSiteController));
router.post('/ops/access/:propertyId/qr', onSiteController.qrGet.bind(onSiteController));
router.put('/ops/work-orders/:orderId/access', onSiteController.orderAccess.bind(onSiteController));
// 2026-10-08 03:20, G7 Ops stage 4: checklists + review queue
router.get('/ops/checklists', checklistController.listTemplates.bind(checklistController));
router.post('/ops/checklists', checklistController.createTemplate.bind(checklistController));
router.get('/ops/checklists/:templateId', checklistController.getTemplate.bind(checklistController));
router.put('/ops/checklists/:templateId', checklistController.updateTemplate.bind(checklistController));
router.put('/ops/work-orders/:orderId/checklist', checklistController.attachToOrder.bind(checklistController));
router.get('/ops/review', checklistController.review.bind(checklistController));
// 2026-10-08 09:30, G7 Ops stage 7: time & pay
router.get('/ops/time', timeController.list.bind(timeController));
router.get('/ops/time/export', timeController.exportCsv.bind(timeController));
router.post('/ops/time', timeController.add.bind(timeController));
router.put('/ops/time/:entryId', timeController.edit.bind(timeController));
router.post('/ops/time/:entryId/void', timeController.voidEntry.bind(timeController));
router.get('/ops/time/:entryId/history', timeController.history.bind(timeController));
// 2026-10-08 11:30, G7 Ops stage 8: preventive schedules
router.get('/ops/schedules', scheduleController.listSchedules.bind(scheduleController));
router.post('/ops/schedules', scheduleController.createSchedule.bind(scheduleController));
router.put('/ops/schedules/:scheduleId', scheduleController.updateSchedule.bind(scheduleController));
router.post('/ops/work-orders/:orderId/:action', workOrderController.managerAction.bind(workOrderController));


export = router;