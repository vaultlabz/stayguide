import express from 'express';
import path from 'path';
import { AuthController } from '../controllers/AuthController';
import { CompanyController } from '../controllers/CompanyController';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';

const router = express.Router();
const authController = new AuthController();
const companyController = new CompanyController();

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

// Protected routes - require super admin authentication
router.use(authenticateToken, requireSuperAdmin);

// Companies management API
router.get('/companies', companyController.getAllCompanies.bind(companyController));
router.post('/companies', companyController.createCompany.bind(companyController));
router.get('/companies/:id', companyController.getCompany.bind(companyController));
router.put('/companies/:id', companyController.updateCompany.bind(companyController));
router.delete('/companies/:id', companyController.deleteCompany.bind(companyController));

// Billing overview
router.get('/billing', (req, res) => {
  res.json({ message: 'Global Billing Overview - Protected' });
});

// Helpdesk management
router.get('/helpdesk', (req, res) => {
  res.json({ message: 'Helpdesk Management - Protected' });
});

export = router;