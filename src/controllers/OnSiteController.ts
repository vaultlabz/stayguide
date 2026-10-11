// 2026-10-08 01:00, G7 Ops stage 3: access codes, QR check-in/out, job photos (worker + manager endpoints)
import { Request, Response } from 'express';
import fs from 'fs';
import QRCode from 'qrcode';
import { AuthRequest } from '../types';
import { WorkOrderController, threshold } from './WorkOrderController';
import { PHOTO_KINDS, PhotoKind, windowBounds, CHECKIN_LEAD_MIN } from '../services/OnSiteService';
import { WorkOrder } from '../services/WorkOrderService';

const CODE_MAX = 100;
const NOTES_MAX = 500;
const baseUrl = (req: Request) => (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store, private');
const clean = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  return typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined;
};

export class OnSiteController extends WorkOrderController {

  // ---- manager: property access + QR ----

  /** Properties of the company with whether a code is set and when the sticker was printed. */
  async accessList(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const properties = (await this.properties.getPropertiesByCompany(company.id)).filter(p => p.status === 'active');
      res.json({
        properties: await Promise.all(properties.map(async p => {
          const access = await this.onsite.getPropertyAccess(p.id);
          const qr = await this.onsite.currentQr(p.id);
          return { id: p.id, name: p.name, has_code: !!access.code, notes: access.notes, qr_created_at: qr?.created_at ?? null };
        }))
      });
    } catch (error) {
      console.error('Error listing property access:', error);
      res.status(500).json({ error: 'Failed to load property access' });
    }
  }

  private async ownedProperty(req: AuthRequest, res: Response) {
    const company = await this.opsCompany(req, res);
    if (!company) return null;
    const property = await this.properties.findById(parseInt(req.params.propertyId));
    if (!property || property.company_id !== company.id) {
      res.status(404).json({ error: 'Property not found' });
      return null;
    }
    return { company, property };
  }

  async accessGet(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedProperty(req, res);
      if (!found) return;
      noStore(res);
      res.json(await this.onsite.getPropertyAccess(found.property.id));
    } catch (error) {
      console.error('Error reading property access:', error);
      res.status(500).json({ error: 'Failed to load access details' });
    }
  }

  async accessSet(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedProperty(req, res);
      if (!found) return;
      const code = clean(req.body?.code, CODE_MAX);
      const notes = clean(req.body?.notes, NOTES_MAX);
      if (code === undefined) return res.status(400).json({ error: `Access code: up to ${CODE_MAX} characters` });
      if (notes === undefined) return res.status(400).json({ error: `Access notes: up to ${NOTES_MAX} characters` });
      await this.onsite.setPropertyAccess(found.property.id, code, notes, req.user!.id);
      console.log(`Access code ${code ? 'set' : 'cleared'} for property ${found.property.id} by ${req.user?.email}`);
      res.json({ message: 'Saved', has_code: !!code, notes });
    } catch (error) {
      console.error('Error saving property access:', error);
      res.status(500).json({ error: 'Failed to save access details' });
    }
  }

  async qrGet(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedProperty(req, res);
      if (!found) return;
      const qr = req.method === 'POST' ? await this.onsite.rotateQr(found.property.id) : await this.onsite.ensureQr(found.property.id);
      const url = `${baseUrl(req)}/maint/scan/${qr.token}`;
      noStore(res);
      res.json({
        property: { id: found.property.id, name: found.property.name, address: found.property.address ?? null },
        company: { name: found.company.name, logo_url: found.company.logo_url || null },
        url, created_at: qr.created_at,
        svg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      });
    } catch (error) {
      console.error('Error with property QR:', error);
      res.status(500).json({ error: 'Failed to load the QR code' });
    }
  }

  /** PUT /ops/work-orders/:orderId/access { code } : per-job code that overrides the property's (empty clears it). */
  async orderAccess(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedOrder(req, res);
      if (!found) return;
      const code = clean(req.body?.code, CODE_MAX);
      if (code === undefined) return res.status(400).json({ error: `Access code: up to ${CODE_MAX} characters` });
      await this.onsite.setOrderAccessOverride(found.order.id, code);
      await this.orders.addEvent(found.order.id, req.user!.id, 'access_set', null, { override: !!code });
      res.json({ message: 'Saved', has_access_override: !!code });
    } catch (error) {
      console.error('Error saving job access code:', error);
      res.status(500).json({ error: 'Failed to save the access code' });
    }
  }

  // ---- worker: access, check-in/out, scan ----

  async revealAccess(req: AuthRequest, res: Response) {
    try {
      const found = await this.workerOrder(req, res);
      if (!found) return;
      const state = this.onsite.accessState(found.order);
      noStore(res);
      if (!state.available) return res.status(403).json({ error: state.reason || 'Not available yet', opens_at: state.opens_at });
      const { code, notes } = await this.onsite.codeFor(found.order);
      if (!code) return res.status(404).json({ error: 'The manager has not added an access code for this property.', notes });
      await this.orders.addEvent(found.order.id, req.user!.id, 'access_viewed', null, null);
      res.json({ code, notes });
    } catch (error) {
      console.error('Error revealing access code:', error);
      res.status(500).json({ error: 'Failed to load the access code' });
    }
  }

  /** Check in (starting the job if it was only assigned) or check out. Shared by the buttons and the QR scan. */
  private async toggleSite(req: AuthRequest, order: WorkOrder, method: 'qr' | 'button', want: 'in' | 'out' | 'toggle') {
    const userId = req.user!.id;
    const open = await this.onsite.openEntryFor(userId);
    const here = open && open.work_order_id === order.id ? open : null;
    const company = (await this.companies.findById(order.company_id))!;
    if (here && want !== 'in') {
      await this.leave(req, company, order, here, method); // 2026-10-10 10:28, #62 location + arrived/left email
      return { status: 200, body: { checked: 'out' as const } };
    }
    if (want === 'out') return { status: 409, body: { error: 'You are not checked in at this job.' } };
    if (here) return { status: 409, body: { error: 'You are already checked in.' } };
    if (open) return { status: 409, body: { error: 'You are still checked in at another job. Check out there first.' } };
    if (order.status === 'awaiting_approval') return { status: 409, body: { error: 'The estimate is waiting for the manager\'s approval.' } };
    if (order.status !== 'assigned' && order.status !== 'in_progress') return { status: 409, body: { error: `This job is ${order.status.replace('_', ' ')}.` } };
    if (method === 'qr') {
      const w = windowBounds(order, CHECKIN_LEAD_MIN);
      const now = new Date();
      if (w && (now < w.from || now > w.to)) return { status: 409, body: { error: 'This job\'s time window is not open. Check the time, or ask the manager to update it.' } };
    }
    if (order.status === 'assigned') {
      const result = await this.orders.transition(order, 'start', { id: userId, role: 'worker' }, {}, threshold(company));
      if ('error' in result) return { status: result.status, body: { error: result.error } };
    }
    const entry = await this.arrive(req, company, order, method);
    return { status: 200, body: { checked: 'in' as const, distance: entry.dist_in ?? null } };
  }

  async checkIn(req: AuthRequest, res: Response) { return this.site(req, res, 'in'); }
  async checkOut(req: AuthRequest, res: Response) { return this.site(req, res, 'out'); }

  private async site(req: AuthRequest, res: Response, want: 'in' | 'out') {
    try {
      const found = await this.workerOrder(req, res);
      if (!found) return;
      const r = await this.toggleSite(req, found.order, 'button', want);
      res.status(r.status).json(r.body);
    } catch (error) {
      console.error('Error checking in/out:', error);
      res.status(500).json({ error: 'Failed to update' });
    }
  }

  /** POST /maint/api/scan/:token { job_id? } : the sticker identifies the property; picks the worker's job there. */
  async scan(req: AuthRequest, res: Response) {
    try {
      const propertyId = await this.onsite.propertyForQr(req.params.token);
      if (!propertyId) return res.status(404).json({ error: 'This QR code is not active. Ask the manager for the current sticker.' });
      const companies = await this.activeCompanies(req.user!.id);
      const jobs = (await this.orders.listForWorker(req.user!.id, companies.map(c => c.company_id)))
        .filter(o => o.property_id === propertyId && ['assigned', 'awaiting_approval', 'in_progress'].includes(o.status));
      const open = await this.onsite.openEntryFor(req.user!.id);
      let job = req.body?.job_id ? jobs.find(j => j.id === Number(req.body.job_id)) : undefined;
      if (!job && open) job = jobs.find(j => j.id === open.work_order_id);
      if (!job && jobs.length > 1) {
        return res.status(300).json({ error: 'You have more than one job here. Choose one.', jobs: jobs.map(j => ({ id: j.id, title: j.title, status: j.status })) });
      }
      job = job || jobs[0];
      if (!job) return res.status(404).json({ error: 'You have no open job at this property.' });
      const r = await this.toggleSite(req, job, 'qr', 'toggle');
      res.status(r.status).json({ ...r.body, job: { id: job.id, title: job.title, property: job.property_name } });
    } catch (error) {
      console.error('Error with QR scan:', error);
      res.status(500).json({ error: 'Failed to check in' });
    }
  }

  // ---- photos ----

  async uploadPhoto(req: AuthRequest, res: Response) {
    try {
      const found = await this.workerOrder(req, res);
      if (!found) return;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: 'Choose a photo to upload' });
      // 2026-10-08 03:10, G7 S4: a photo can belong to a checklist step
      const itemId = req.body?.checklist_item_id ? Number(req.body.checklist_item_id) : null;
      const item = itemId ? await this.checklists.getJobItem(itemId) : null;
      if (itemId && (!item || item.work_order_id !== found.order.id)) return res.status(400).json({ error: 'Unknown checklist step' });
      const kind = (req.body?.kind || (item ? 'step' : 'after')) as PhotoKind;
      if (!PHOTO_KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid photo type' });
      if (!['assigned', 'in_progress'].includes(found.order.status)) return res.status(409).json({ error: 'Photos can be added while the job is assigned or in progress' });
      const caption = clean(req.body?.caption, 255);
      if (caption === undefined) return res.status(400).json({ error: 'Caption is too long' });
      const photo = await this.onsite.addPhoto(found.order, kind, file.buffer, req.user!.id, caption);
      if ('error' in photo) return res.status(400).json(photo);
      if (item) await this.checklists.linkPhoto(item, photo.id);
      await this.orders.addEvent(found.order.id, req.user!.id, 'photo_added', caption ?? item?.label ?? null, { kind, photo_id: photo.id, checklist_item_id: item?.id ?? null });
      res.status(201).json({ photo: { id: photo.id, kind: photo.kind, caption: photo.caption, url: this.onsite.signedUrl(photo) } });
    } catch (error) {
      console.error('Error uploading job photo:', error);
      res.status(500).json({ error: 'Failed to upload the photo' });
    }
  }

  /** Workers can remove their own photos until they submit; afterwards photos are part of the record. */
  async deletePhoto(req: AuthRequest, res: Response) {
    try {
      const found = await this.workerOrder(req, res);
      if (!found) return;
      const photo = await this.onsite.getPhoto(parseInt(req.params.photoId));
      if (!photo || photo.work_order_id !== found.order.id || photo.uploaded_by !== req.user!.id) return res.status(404).json({ error: 'Photo not found' });
      if (!['assigned', 'in_progress'].includes(found.order.status)) return res.status(409).json({ error: 'Submitted photos can no longer be removed' });
      // a photo step loses its tick when its photo goes
      for (const it of (await this.checklists.jobItems(found.order.id)).filter(i => i.photo_id === photo.id)) await this.checklists.linkPhoto(it, null);
      await this.onsite.deletePhoto(photo);
      await this.orders.addEvent(found.order.id, req.user!.id, 'photo_removed', null, { kind: photo.kind });
      res.json({ message: 'Removed' });
    } catch (error) {
      console.error('Error deleting job photo:', error);
      res.status(500).json({ error: 'Failed to remove the photo' });
    }
  }

  /** GET /ops-photo/:photoId?e=&s= : signed URL, no session needed (works in <img>). */
  async servePhoto(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.photoId);
      if (!this.onsite.checkSignature(id, Number(req.query.e), String(req.query.s || ''))) return res.status(403).json({ error: 'Link expired' });
      const photo = await this.onsite.getPhoto(id);
      if (!photo) return res.status(404).json({ error: 'Not found' });
      const file = this.onsite.filePath(photo);
      if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error('Error serving job photo:', error);
      res.status(500).json({ error: 'Failed to load the photo' });
    }
  }
}

