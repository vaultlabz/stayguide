import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { CompanyService } from '../services/CompanyService';
import { generateToken } from '../utils/auth';
import { AuthRequest } from '../types';

export class AuthController {
  private userService = new UserService();
  private companyService = new CompanyService();

  async adminLogin(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await this.userService.validatePassword(email, password);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id
      });

      console.log(`Admin login successful: ${user.email}`);
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async companyLogin(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const { companySlug } = req.params;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (!companySlug) {
        return res.status(400).json({ error: 'Company slug is required' });
      }

      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const user = await this.userService.validatePassword(email, password);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.role === 'company_admin' && user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied for this company' });
      }

      if (user.role !== 'super_admin' && user.role !== 'company_admin') {
        return res.status(403).json({ error: 'Company access required' });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id
      });

      console.log(`Company login successful: ${user.email} for ${company.name}`);
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          company_id: user.company_id
        },
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug
        }
      });
    } catch (error) {
      console.error('Company login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async logout(req: AuthRequest, res: Response) {
    try {
      console.log(`User logged out: ${req.user?.email}`);
      res.json({ message: 'Logout successful' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async profile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = await this.userService.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let company = null;
      if (user.company_id) {
        company = await this.companyService.findById(user.company_id);
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          company_id: user.company_id,
          last_login: user.last_login
        },
        company: company ? {
          id: company.id,
          name: company.name,
          slug: company.slug
        } : null
      });
    } catch (error) {
      console.error('Profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}