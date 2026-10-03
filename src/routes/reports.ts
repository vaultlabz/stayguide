import { Router } from 'express';
import { ReportController } from '../controllers/ReportController';
import { authenticateToken, authenticateDevice } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';

const router = Router();
const reportController = new ReportController();

// 2026-10-03 11:39, guest reports only from paired tablets, max 10 per device per hour
const guestReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  key: (req: any) => `report:${req.device?.id}`,
  message: 'Too many reports from this device. Please call the emergency contact if this is urgent.'
});

router.post('/guest', authenticateDevice, guestReportLimiter, reportController.createGuestReport.bind(reportController));

// Public endpoint (amenity names only) kept for backwards compatibility; the tablet now uses /device/content

// Get available amenities for a property (for report form dropdown)
router.get('/property/:propertyId/amenities', reportController.getPropertyAmenities.bind(reportController));

// Protected endpoints (authentication required)
// Company Admin and Super Admin endpoints
router.get('/property/:propertyId', authenticateToken, reportController.getPropertyReports.bind(reportController));
router.put('/:reportId/status', authenticateToken, reportController.updateReportStatus.bind(reportController));

// Super Admin only endpoints
router.get('/all', authenticateToken, reportController.getAllReports.bind(reportController));
router.get('/urgent', authenticateToken, reportController.getReportsNeedingAttention.bind(reportController));
router.get('/amenity/:amenityId', authenticateToken, reportController.getAmenityReports.bind(reportController));
router.post('/amenity/:amenityId/auto-close', authenticateToken, reportController.autoCloseAmenityReports.bind(reportController));

export default router;
