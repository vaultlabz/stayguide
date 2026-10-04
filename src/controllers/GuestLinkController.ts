// 2026-10-03 22:42, G2: hosts manage a property's public phone/web guide link from the dashboard
import crypto from 'crypto';
import QRCode from 'qrcode';
import { Response } from 'express';
import { AuthRequest, Property } from '../types';
import { resolveOwnedProperty } from '../utils/ownership';
import { PropertyService } from '../services/PropertyService';

export class GuestLinkController {
  private propertyService = new PropertyService();

  private newToken(): string {
    return crypto.randomBytes(24).toString('base64url'); // 32 chars, ~192 bits
  }

  private async describe(req: AuthRequest, property: Property, token: string) {
    const baseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const url = `${baseUrl}/g/${token}`;
    return {
      url,
      qr_svg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
      show_wifi: !(property.guest_link_show_wifi === false || property.guest_link_show_wifi === 0)
    };
  }

  // GET /company/:companySlug/properties/:propertySlug/guest-link  (creates the link on first use)
  async get(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      let token = property.guest_link_token;
      if (!token) {
        token = this.newToken();
        await this.propertyService.setGuestLinkToken(property.id, token);
      }
      res.json(await this.describe(req, property, token));
    } catch (error) {
      console.error('Error getting guest link:', error);
      res.status(500).json({ error: 'Failed to get guest link' });
    }
  }

  // POST /company/:companySlug/properties/:propertySlug/guest-link/rotate  (old link stops working immediately)
  async rotate(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const token = this.newToken();
      await this.propertyService.setGuestLinkToken(property.id, token);
      console.log(`Guest link rotated for property ${property.id} by ${req.user?.email}`);
      res.json(await this.describe(req, property, token));
    } catch (error) {
      console.error('Error rotating guest link:', error);
      res.status(500).json({ error: 'Failed to rotate guest link' });
    }
  }
}
