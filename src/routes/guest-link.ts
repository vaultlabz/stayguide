// 2026-10-03 22:42, G2 free-tier phone/web guide: /g/:token
// Anyone with the link can read the guide (like a shared guidebook); the token is random, rotatable, and never indexed or leaked via Referer.
import express from 'express';
import path from 'path';
import { PropertyController } from '../controllers/PropertyController';
import { ReportController } from '../controllers/ReportController';
import { PropertyService } from '../services/PropertyService';
import { rateLimit } from '../middleware/rate-limit';
import { AnalyticsController } from '../controllers/AnalyticsController';

const router = express.Router();
const propertyController = new PropertyController();
const reportController = new ReportController();
const propertyService = new PropertyService();

export const GUEST_LINK_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

// Privacy headers for every guide-link response
router.use('/g/:token', (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

async function resolveGuestLink(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { token } = req.params;
    if (!GUEST_LINK_TOKEN.test(token)) return res.status(404).json({ error: 'This guide link is not valid' });
    const property = await propertyService.findByGuestLinkToken(token);
    if (!property || property.status !== 'active') return res.status(404).json({ error: 'This guide link is not valid' });
    (req as any).guestLink = { property };
    next();
  } catch (error) {
    console.error('Guest link lookup failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const readLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, key: req => `glread:${req.ip}`, message: 'Too many requests' });
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  key: req => `glreport:${req.ip}:${req.params.token}`,
  message: 'Too many reports. Please call the emergency contact if this is urgent.'
});

// The page itself is static; validity is checked by the content API (no token oracle via the HTML response)
router.get('/g/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/tablet-app.html'));
});

router.get('/g/:token/content', readLimiter, resolveGuestLink, propertyController.getGuestLinkContent.bind(propertyController));
router.get('/g/:token/weather', readLimiter, resolveGuestLink, propertyController.getGuestLinkWeather.bind(propertyController));
router.post('/g/:token/report', reportLimiter, resolveGuestLink, reportController.createGuestReport.bind(reportController));

// 2026-10-04 00:26, G4 section analytics from the phone guide (60 batches/min per IP + link)
const analyticsController = new AnalyticsController();
const eventsLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, key: req => `glevents:${req.ip}:${req.params.token}`, message: 'Too many events' });
router.post('/g/:token/events', eventsLimiter, resolveGuestLink, analyticsController.guestLinkEvents.bind(analyticsController));

export default router;
