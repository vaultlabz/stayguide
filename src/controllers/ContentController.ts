// 2026-10-03 22:25, G1 content management endpoints (company admin, ownership-checked)
import { Response } from 'express';
import { AuthRequest } from '../types';
import { resolveOwnedProperty } from '../utils/ownership';
import { ContentService, CONTENT_TYPES, isContentType, validateContent } from '../services/ContentService';

export class ContentController {
  private contentService = new ContentService();

  // GET /company/:companySlug/properties/:propertySlug/content
  async getAll(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const [restaurants, videos, localInfo, announcements, welcome] = await Promise.all([
        this.contentService.list('restaurants', property.id),
        this.contentService.list('videos', property.id),
        this.contentService.list('local-info', property.id),
        this.contentService.list('announcements', property.id),
        this.contentService.getWelcome(property.id)
      ]);

      res.json({
        welcome_message: welcome,
        restaurants,
        videos,
        'local-info': localInfo,
        announcements,
        options: Object.fromEntries(Object.entries(CONTENT_TYPES).map(([k, c]) => [k, c.enums]))
      });
    } catch (error) {
      console.error('Error loading guide content:', error);
      res.status(500).json({ error: 'Failed to load guide content' });
    }
  }

  // POST /company/:companySlug/properties/:propertySlug/content/:type
  async create(req: AuthRequest, res: Response) {
    try {
      const { type } = req.params;
      if (!isContentType(type)) return res.status(404).json({ error: 'Unknown content type' });
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const { fields, error } = validateContent(type, req.body, false);
      if (error) return res.status(400).json({ error });

      const item = await this.contentService.create(type, property.id, fields!, req.user!.id);
      console.log(`Content created: ${type} #${item?.id} on property ${property.id} by ${req.user?.email}`);
      res.status(201).json({ item });
    } catch (error) {
      console.error('Error creating content:', error);
      res.status(500).json({ error: 'Failed to create content' });
    }
  }

  // PUT /company/:companySlug/properties/:propertySlug/content/:type/:id
  async update(req: AuthRequest, res: Response) {
    try {
      const { type } = req.params;
      if (!isContentType(type)) return res.status(404).json({ error: 'Unknown content type' });
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const { fields, error } = validateContent(type, req.body, true);
      if (error) return res.status(400).json({ error });

      const item = await this.contentService.update(type, property.id, parseInt(req.params.id), fields!);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json({ item });
    } catch (error) {
      console.error('Error updating content:', error);
      res.status(500).json({ error: 'Failed to update content' });
    }
  }

  // DELETE /company/:companySlug/properties/:propertySlug/content/:type/:id
  async remove(req: AuthRequest, res: Response) {
    try {
      const { type } = req.params;
      if (!isContentType(type)) return res.status(404).json({ error: 'Unknown content type' });
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const removed = await this.contentService.remove(type, property.id, parseInt(req.params.id));
      if (!removed) return res.status(404).json({ error: 'Item not found' });
      res.json({ message: 'Deleted' });
    } catch (error) {
      console.error('Error deleting content:', error);
      res.status(500).json({ error: 'Failed to delete content' });
    }
  }

  // PUT /company/:companySlug/properties/:propertySlug/content/:type/order  { ids: [...] }
  async reorder(req: AuthRequest, res: Response) {
    try {
      const { type } = req.params;
      if (!isContentType(type) || !CONTENT_TYPES[type].orderable) return res.status(404).json({ error: 'Unknown or unorderable content type' });
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
      if (!ids || !ids.every(Number.isInteger)) return res.status(400).json({ error: 'ids must be an array of item ids' });

      const ok = await this.contentService.reorder(type, property.id, ids);
      if (!ok) return res.status(400).json({ error: 'ids must list every item of this property exactly once' });
      res.json({ message: 'Reordered' });
    } catch (error) {
      console.error('Error reordering content:', error);
      res.status(500).json({ error: 'Failed to reorder content' });
    }
  }

  // PUT /company/:companySlug/properties/:propertySlug/welcome  { welcome_message }
  async setWelcome(req: AuthRequest, res: Response) {
    try {
      const property = await resolveOwnedProperty(req, res);
      if (!property) return;

      const raw = req.body?.welcome_message;
      if (raw !== null && raw !== undefined && typeof raw !== 'string') return res.status(400).json({ error: 'welcome_message must be text' });
      const message = typeof raw === 'string' ? raw.trim() : '';
      if (message.length > 2000) return res.status(400).json({ error: 'welcome_message is too long (max 2000)' });

      await this.contentService.setWelcome(property.id, message || null);
      res.json({ welcome_message: message || null });
    } catch (error) {
      console.error('Error saving welcome message:', error);
      res.status(500).json({ error: 'Failed to save welcome message' });
    }
  }
}
