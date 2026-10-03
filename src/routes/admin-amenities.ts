import { Router } from 'express';
import { AdminAmenityController } from '../controllers/AdminAmenityController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const adminAmenityController = new AdminAmenityController();

// All routes require authentication and Super Admin role
// The role check is handled within each controller method

// Amenity management endpoints
router.get('/amenities', authenticateToken, adminAmenityController.getAllAmenities.bind(adminAmenityController));
router.get('/amenities/:amenityId', authenticateToken, adminAmenityController.getAmenityWithReports.bind(adminAmenityController));
router.put('/amenities/:amenityId', authenticateToken, adminAmenityController.updateAmenity.bind(adminAmenityController));
router.delete('/amenities/:amenityId', authenticateToken, adminAmenityController.deleteAmenity.bind(adminAmenityController));

// Global template management
router.get('/templates', authenticateToken, adminAmenityController.getGlobalTemplates.bind(adminAmenityController));
router.post('/templates', authenticateToken, adminAmenityController.createGlobalTemplate.bind(adminAmenityController));
router.post('/templates/:templateId/apply', authenticateToken, adminAmenityController.applyTemplateToProperties.bind(adminAmenityController));

// Bulk operations
router.post('/amenities/bulk-update', authenticateToken, adminAmenityController.bulkUpdateAmenities.bind(adminAmenityController));

// Analytics and overview
router.get('/analytics', authenticateToken, adminAmenityController.getAmenityAnalytics.bind(adminAmenityController));
router.get('/properties', authenticateToken, adminAmenityController.getAllProperties.bind(adminAmenityController));

export default router;
