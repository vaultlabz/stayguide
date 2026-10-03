import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const authController = new AuthController();

// General API routes (not company-specific)
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: 'connected' // TODO: Add actual DB health check
  });
});

// Authentication API
router.post('/auth/admin/login', authController.adminLogin.bind(authController));
router.post('/auth/logout', authenticateToken, authController.logout.bind(authController));
router.get('/auth/profile', authenticateToken, authController.profile.bind(authController));

// Token refresh endpoint
router.post('/auth/refresh', authenticateToken, (req, res) => {
  res.json({ message: 'Token refresh - TODO: Implement refresh logic' });
});

export = router;