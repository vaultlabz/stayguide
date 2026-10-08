import express from 'express';
import path from 'path';
import adminRoutes from './admin';
import companyRoutes from './company';
import apiRoutes from './api';
import billingRoutes from './billing';
import reportRoutes from './reports';
import adminAmenityRoutes from './admin-amenities';
import deviceRoutes from './device';
import linkRoutes from './links';
import guestLinkRoutes from './guest-link';
import maintRoutes from './maint'; // 2026-10-07 19:00, G7 Ops worker app
import { renderLanding } from '../utils/pricing-html';
import { AuthController } from '../controllers/AuthController';
import { rateLimit } from '../middleware/rate-limit';

const router = express.Router();

// Marketing/Landing page routes
// 2026-10-04 00:12, G5: pricing section is rendered server-side from src/config/plans.ts
router.get('/', (req, res) => {
  res.type('html').send(renderLanding(path.join(__dirname, '../views')));
});

// 2026-10-03 23:06, G3 self-serve signup page
router.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/signup.html'));
});

// 2026-10-07 17:15, single sign-in page: email + password, company resolved from the account (replaces the slug prompt())
const authController = new AuthController();
const signInLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: req => `signin:${req.ip}`, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/login.html'));
});
router.post('/login', signInLimiter, authController.signIn.bind(authController));

// 2026-10-03 11:39, paired tablets: /tablet, /device/pair, /device/content
router.use(deviceRoutes);

// 2026-10-03 12:32, QR scan redirects for direct booking / reviews
router.use(linkRoutes);

// 2026-10-03 22:42, G2 public phone/web guide link
router.use(guestLinkRoutes);

// 2026-10-07 19:00, G7 Ops worker app: /maint pages + /maint/api
router.use(maintRoutes);

// Main admin routes
router.use('/admin', adminRoutes);

// Company routes (dynamic company slug)
router.use('/company/:companySlug', companyRoutes);

// API routes
router.use('/api', apiRoutes);

// Billing routes
router.use('/billing', billingRoutes);

// Integrated reporting routes
router.use('/reports', reportRoutes);

// Super Admin amenity management routes (separate from main admin routes)
router.use('/admin/amenities', adminAmenityRoutes);

export default router;