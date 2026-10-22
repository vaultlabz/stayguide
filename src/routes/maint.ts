// 2026-10-07 19:00, G7 Ops stage 1: worker web app (/maint) pages + sign-in / onboarding API
import express from 'express';
import path from 'path';
import { OpsController } from '../controllers/OpsController';
import { WorkOrderController } from '../controllers/WorkOrderController'; // 2026-10-07 22:40, G7 S2
import { OnSiteController } from '../controllers/OnSiteController'; // 2026-10-08 01:10, G7 S3
import { ChecklistController } from '../controllers/ChecklistController'; // 2026-10-08 03:20, G7 S4
import { TimeController } from '../controllers/TimeController'; // 2026-10-08 09:30, G7 S7
import { uploadJobPhoto, uploadCertificate } from '../middleware/upload';
import { idempotentOp } from '../middleware/client-ops'; // 2026-10-08 05:40, G7 S5
import { authenticateToken, requireFieldWorker } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';

const router = express.Router();
const ops = new OpsController();
const workOrders = new WorkOrderController();
const onSite = new OnSiteController();
const checklists = new ChecklistController();
const time = new TimeController();

// multer errors (too large, not an image) as JSON 400s instead of the generic error handler
const photoUpload = (req: express.Request, res: express.Response, next: express.NextFunction) =>
  uploadJobPhoto(req, res, (err: any) => (err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Photos can be up to 15 MB' : err.message || 'Upload failed' }) : next()));

const fifteen = 15 * 60 * 1000;
const loginLimiter = rateLimit({ windowMs: fifteen, max: 10, key: req => `maintlogin:${req.ip}`, message: 'Too many sign-in attempts. Please wait 15 minutes.' });
const codeRequestLimiter = rateLimit({ windowMs: fifteen, max: 5, key: req => `maintcode:${req.ip}:${String(req.body?.email || '').toLowerCase()}`, message: 'Too many codes requested. Please wait 15 minutes.' });
const codeVerifyLimiter = rateLimit({ windowMs: fifteen, max: 10, key: req => `maintverify:${req.ip}`, message: 'Too many attempts. Please wait 15 minutes.' });
const inviteLimiter = rateLimit({ windowMs: fifteen, max: 20, key: req => `maintinvite:${req.ip}`, message: 'Too many attempts. Please wait 15 minutes.' });

// Pages (static; the page JS handles sign-in)
router.get('/maint', (req, res) => res.sendFile(path.join(__dirname, '../views/maint.html')));
router.get('/maint/invite/:token', (req, res) => res.sendFile(path.join(__dirname, '../views/maint-invite.html')));
router.get('/maint/scan/:token', (req, res) => res.sendFile(path.join(__dirname, '../views/maint-scan.html'))); // 2026-10-08 01:10, G7 S3

// Onboarding + sign-in
router.get('/maint/api/invite/:token', inviteLimiter, ops.inviteInfo.bind(ops));
router.post('/maint/api/invite/:token/accept', inviteLimiter, ops.acceptInvite.bind(ops));
router.post('/maint/api/login', loginLimiter, ops.login.bind(ops));
router.post('/maint/api/login-code', codeRequestLimiter, ops.requestCode.bind(ops));
router.post('/maint/api/login-code/verify', codeVerifyLimiter, ops.verifyCode.bind(ops));

// Signed-in worker
router.get('/maint/api/me', authenticateToken, requireFieldWorker, ops.me.bind(ops));

// 2026-10-07 22:40, G7 S2: the worker's own jobs
const jobActionLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, key: (req: any) => `maintjob:${req.user?.id}`, message: 'Too many updates. Please wait a minute.' });
router.get('/maint/api/jobs', authenticateToken, requireFieldWorker, workOrders.workerJobs.bind(workOrders));
router.get('/maint/api/jobs/:jobId', authenticateToken, requireFieldWorker, workOrders.workerJob.bind(workOrders));
// 2026-10-08 01:10, G7 Ops stage 3 (registered before the generic /:action route)
const accessLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, key: (req: any) => `maintaccess:${req.user?.id}`, message: 'Too many requests for access codes. Please wait.' });
const scanLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, key: (req: any) => `maintscan:${req.ip}`, message: 'Too many scans. Please wait.' });
// idempotentOp: updates queued offline are resent with X-Client-Op-Id; a resend returns the first result
const auth = [authenticateToken, requireFieldWorker];
const op = [authenticateToken, requireFieldWorker, idempotentOp];
router.post('/maint/api/jobs/:jobId/access', ...auth, accessLimiter, onSite.revealAccess.bind(onSite));
router.post('/maint/api/jobs/:jobId/check-in', ...op, jobActionLimiter, onSite.checkIn.bind(onSite));
router.post('/maint/api/jobs/:jobId/check-out', ...op, jobActionLimiter, onSite.checkOut.bind(onSite));
router.post('/maint/api/jobs/:jobId/photos', ...op, jobActionLimiter, photoUpload, onSite.uploadPhoto.bind(onSite));
router.delete('/maint/api/jobs/:jobId/photos/:photoId', ...auth, onSite.deletePhoto.bind(onSite));
router.post('/maint/api/scan/:token', scanLimiter, ...auth, onSite.scan.bind(onSite));
router.post('/maint/api/jobs/:jobId/checklist/:itemId', ...op, jobActionLimiter, checklists.tick.bind(checklists)); // 2026-10-08 03:20, G7 S4
router.get('/ops-photo/:photoId', onSite.servePhoto.bind(onSite));
// 2026-10-08 07:40, G7 S6: worker profile + insurance certificate
const certUpload = (req: express.Request, res: express.Response, next: express.NextFunction) =>
  uploadCertificate(req, res, (err: any) => (err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The certificate can be up to 10 MB' : err.message || 'Upload failed' }) : next()));
router.get('/maint/api/profile', ...auth, ops.profile.bind(ops));
router.get('/maint/api/time', ...auth, time.mine.bind(time)); // 2026-10-08 09:30, G7 S7
router.put('/maint/api/profile/vendor', ...auth, ops.saveVendorDetails.bind(ops));
router.post('/maint/api/profile/certificate', ...auth, jobActionLimiter, certUpload, ops.uploadCertificate.bind(ops));
router.get('/ops-file/coi/:userId/:file', ops.serveCertificate.bind(ops));
// 2026-10-08 05:40, G7 S5: web push
router.get('/maint/api/push', ...auth, ops.pushKey.bind(ops));
router.post('/maint/api/push/subscribe', ...auth, ops.pushSubscribe.bind(ops));
router.post('/maint/api/push/unsubscribe', ...auth, ops.pushUnsubscribe.bind(ops));
router.post('/maint/api/jobs/:jobId/:action', ...op, jobActionLimiter, workOrders.workerAction.bind(workOrders));

export default router;
