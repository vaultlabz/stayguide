// 2026-10-03 11:39, paired-tablet routes: kiosk start URL, pairing, device-authenticated content
import express from 'express';
import path from 'path';
import { DeviceController } from '../controllers/DeviceController';
import { PropertyController } from '../controllers/PropertyController';
import { authenticateDevice } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { AnalyticsController } from '../controllers/AnalyticsController';

const router = express.Router();
const deviceController = new DeviceController();
const propertyController = new PropertyController();

// Single kiosk start URL for every tablet; the page shows a pairing screen until paired
router.get('/tablet', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/tablet-app.html'));
});

// Pairing codes are 6 digits, so limit guesses per client IP
const pairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: req => `pair:${req.ip}`,
  message: 'Too many pairing attempts. Please wait 15 minutes and try again.'
});

router.post('/device/pair', pairLimiter, deviceController.pair.bind(deviceController));

router.get('/device/weather', authenticateDevice, propertyController.getDeviceWeather.bind(propertyController));
router.get('/device/content', authenticateDevice, propertyController.getDeviceContent.bind(propertyController));

// 2026-10-04 00:26, G4 section analytics from paired tablets (60 batches/min per device)
const analyticsController = new AnalyticsController();
const deviceEventsLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, key: (req: any) => `devevents:${req.device?.id}`, message: 'Too many events' });
router.post('/device/events', authenticateDevice, deviceEventsLimiter, analyticsController.deviceEvents.bind(analyticsController));

export default router;
