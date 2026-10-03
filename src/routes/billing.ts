import express from 'express';
import { BillingController } from '../controllers/BillingController';
import { authenticateToken, requireSuperAdmin, requireCompanyAdmin } from '../middleware/auth';

const router = express.Router();
const billingController = new BillingController();

// All billing routes require authentication
router.use(authenticateToken);

// Global billing routes (super admin only)
router.get('/global/stats', requireSuperAdmin, billingController.getAllBillingRecords.bind(billingController));

// Company-specific billing routes
router.get('/company/:companyId', billingController.getBillingRecords.bind(billingController));
router.post('/company/:companyId', billingController.createBillingRecord.bind(billingController));

// Billing record management
router.get('/:billingId', billingController.getInvoiceDetails.bind(billingController));
router.put('/:billingId/status', billingController.updateBillingStatus.bind(billingController));

// Payment processing
router.post('/:billingId/payment-intent', billingController.createPaymentIntent.bind(billingController));

// Email management (super admin only)
router.post('/:billingId/send-email', requireSuperAdmin, billingController.sendInvoiceEmail.bind(billingController));

export = router;