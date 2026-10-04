// 2026-10-03 11:39, tablet pairing endpoints (company-admin management + device redemption)
import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { DeviceService } from '../services/DeviceService';
import { PropertyService } from '../services/PropertyService';
import { resolveOwnedProperty } from '../utils/ownership';
import { CompanyService } from '../services/CompanyService';
import { entitlementsFor, upgradeRequired } from '../services/EntitlementService'; // 2026-10-03 23:06 // 2026-10-03 22:25, shared ownership check

export class DeviceController {
  private deviceService = new DeviceService();
  private propertyService = new PropertyService();
  private companyService = new CompanyService();

  // POST /company/:companySlug/properties/:propertySlug/devices/pairing-code
  async createPairingCode(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      // 2026-10-03 23:06, G3: pairing tablets is a Pro feature
      const company = await this.companyService.findById(property.company_id);
      if (!entitlementsFor(company).features.tablet && req.user?.role !== 'super_admin') {
        return upgradeRequired(res, 'tablet', 'Tablets are part of Pro. The Free plan includes the phone guide link.');
      }

      const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : undefined;
      const { device, code, expiresAt } = await this.deviceService.createPairingCode(property.id, name || undefined);

      console.log(`Pairing code issued for ${property.name} by ${req.user?.email}`);
      res.status(201).json({
        message: 'Pairing code created',
        device_id: device.id,
        code,
        expires_at: expiresAt
      });
    } catch (error) {
      console.error('Error creating pairing code:', error);
      res.status(500).json({ error: 'Failed to create pairing code' });
    }
  }

  // GET /company/:companySlug/properties/:propertySlug/devices
  async listDevices(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const devices = await this.deviceService.listByProperty(property.id);
      res.json({
        devices: devices.map(d => ({
          id: d.id,
          type: d.type,
          name: d.name || null,
          status: d.status,
          pairing_expires_at: d.pairing_expires_at || null,
          last_seen_at: d.last_seen_at || null,
          created_at: d.created_at
        }))
      });
    } catch (error) {
      console.error('Error listing devices:', error);
      res.status(500).json({ error: 'Failed to list devices' });
    }
  }

  // DELETE /company/:companySlug/properties/:propertySlug/devices/:deviceId
  async revokeDevice(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const revoked = await this.deviceService.revoke(parseInt(req.params.deviceId), property.id);
      if (!revoked) {
        return res.status(404).json({ error: 'Device not found' });
      }

      console.log(`Device ${req.params.deviceId} revoked by ${req.user?.email}`);
      res.json({ message: 'Device revoked' });
    } catch (error) {
      console.error('Error revoking device:', error);
      res.status(500).json({ error: 'Failed to revoke device' });
    }
  }

  // POST /device/pair  { code }  (public, rate limited)
  async pair(req: Request, res: Response) {
    try {
      const code = String(req.body?.code || '').replace(/\D/g, '');
      const result = await this.deviceService.redeemPairingCode(code);
      if (!result) {
        return res.status(400).json({ error: 'Invalid or expired pairing code' });
      }

      const property = await this.propertyService.findById(result.device.property_id);
      res.json({
        message: 'Device paired',
        token: result.token,
        device_id: result.device.id,
        property: property ? { name: property.name } : null
      });
    } catch (error) {
      console.error('Error pairing device:', error);
      res.status(500).json({ error: 'Failed to pair device' });
    }
  }
}
