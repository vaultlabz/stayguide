// 2026-10-04 00:26, G4 section analytics endpoints
import { Response } from 'express';
import { AuthRequest, Property } from '../types';
import { AnalyticsService, validEvents, EventSource } from '../services/AnalyticsService';
import { CompanyService } from '../services/CompanyService';
import { PropertyService } from '../services/PropertyService';
import { entitlementsFor, upgradeRequired } from '../services/EntitlementService';
import { resolveOwnedProperty, resolveOwnedCompany } from '../utils/ownership';

export class AnalyticsController {
  private analytics = new AnalyticsService();
  private companyService = new CompanyService();
  private propertyService = new PropertyService();

  private async ingest(res: Response, property: Property | null, source: EventSource, deviceId: number | null, body: any) {
    if (!property) return res.status(404).json({ error: 'Property not available' });
    const events = validEvents(body?.events);
    // Only Pro/Portfolio accounts get analytics; others are acknowledged and dropped (no data kept)
    const company = await this.companyService.findById(property.company_id);
    const stored = entitlementsFor(company).features.analytics ? await this.analytics.record(property.id, source, deviceId, events) : 0;
    res.status(202).json({ accepted: events.length, stored });
  }

  // POST /device/events   (paired tablet)
  async deviceEvents(req: AuthRequest, res: Response) {
    try {
      const property = await this.propertyService.findById(req.device!.property_id);
      await this.ingest(res, property, 'tablet', req.device!.id, req.body);
    } catch (error) {
      console.error('Error recording device events:', error);
      res.status(500).json({ error: 'Failed to record events' });
    }
  }

  // POST /g/:token/events   (phone/web guide link)
  async guestLinkEvents(req: AuthRequest, res: Response) {
    try {
      await this.ingest(res, (req as any).guestLink.property, 'guest_link', null, req.body);
    } catch (error) {
      console.error('Error recording guest link events:', error);
      res.status(500).json({ error: 'Failed to record events' });
    }
  }

  private days(req: AuthRequest) {
    const d = parseInt(String(req.query.days || '30'));
    return [7, 30, 90].includes(d) ? d : 30;
  }

  // GET /company/:companySlug/properties/:propertySlug/analytics?days=30
  async propertySummary(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;
      const company = await this.companyService.findById(property.company_id);
      if (!entitlementsFor(company).features.analytics && req.user?.role !== 'super_admin') {
        return upgradeRequired(res, 'analytics', 'Guest activity analytics are part of Pro.');
      }
      res.json(await this.analytics.summary([property.id], this.days(req)));
    } catch (error) {
      console.error('Error loading property analytics:', error);
      res.status(500).json({ error: 'Failed to load analytics' });
    }
  }

  // GET /company/:companySlug/analytics/summary?days=30   (dashboard stat card)
  async companySummary(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      if (!entitlementsFor(company).features.analytics && req.user?.role !== 'super_admin') {
        return res.json({ available: false });
      }
      const properties = await this.propertyService.getPropertiesByCompany(company.id);
      const summary = await this.analytics.summary(properties.map(p => p.id), this.days(req));
      res.json({ available: true, days: summary.days, visits: summary.visits });
    } catch (error) {
      console.error('Error loading company analytics:', error);
      res.status(500).json({ error: 'Failed to load analytics' });
    }
  }
}
