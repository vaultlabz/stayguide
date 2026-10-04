import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticateToken } from '../middleware/auth';
import { SignupController } from '../controllers/SignupController';
import { rateLimit } from '../middleware/rate-limit';

const router = express.Router();
const authController = new AuthController();
const signupController = new SignupController();

// 2026-10-03 23:06, G3 self-serve signup (5 accounts per hour per IP)
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, key: req => `signup:${req.ip}`, message: 'Too many signups from this network. Please try again later.' });
router.post('/signup', signupLimiter, signupController.signup.bind(signupController));

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