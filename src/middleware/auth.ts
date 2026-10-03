import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { AuthRequest } from '../types';
import { UserService } from '../services/UserService';
import { CompanyService } from '../services/CompanyService';
import { DeviceService } from '../services/DeviceService';

// 2026-10-03 11:39, paired-tablet authentication: `Authorization: Device <token>`
export const authenticateDevice = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Device' || !token) {
      return res.status(401).json({ error: 'Device token required', code: 'DEVICE_UNPAIRED' });
    }

    const device = await new DeviceService().authenticate(token);
    if (!device) {
      return res.status(401).json({ error: 'Device not paired or revoked', code: 'DEVICE_UNPAIRED' });
    }

    req.device = device;
    next();
  } catch (error) {
    console.error('Device authentication failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = verifyToken(token);
    const userService = new UserService();
    const user = await userService.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.status !== 'active') {
      return res.status(401).json({ error: 'User account is inactive' });
    }

    req.user = user;
    console.log(`Authenticated user: ${user.email} (${user.role})`);
    next();
  } catch (error) {
    console.error('Authentication failed:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    console.log(`Role check passed: ${req.user.role} in ${allowedRoles}`);
    next();
  };
};

export const requireSuperAdmin = requireRole(['super_admin']);

// 2026-10-03 11:34, company admins must belong to the company in the URL (was: any company slug accepted)
export const requireCompanyAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role === 'super_admin') {
    console.log('Super admin access granted');
    return next();
  }

  if (req.user.role === 'company_admin') {
    const companySlug = req.params.companySlug;
    if (companySlug && req.user.company_id) {
      try {
        const company = await new CompanyService().findBySlug(companySlug);
        if (company && company.id === req.user.company_id) {
          console.log(`Company admin access granted for ${companySlug}`);
          return next();
        }
      } catch (error) {
        console.error('Company admin check failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  return res.status(403).json({
    error: 'Company admin access required',
    role: req.user.role
  });
};