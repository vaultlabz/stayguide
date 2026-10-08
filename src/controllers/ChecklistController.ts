// 2026-10-08 03:10, G7 Ops stage 4: checklist templates (manager), job checklists (manager + worker), review queue
import { Response } from 'express';
import { AuthRequest } from '../types';
import { OnSiteController } from './OnSiteController';
import { WO_TYPES, WoType } from '../services/WorkOrderService';
import { MAX_ITEMS } from '../services/ChecklistService';
import { OnSiteService } from '../services/OnSiteService';

const label = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);

export class ChecklistController extends OnSiteController {

  /** Validates { name, type, items: [{ label, requires_photo }] }; `partial` allows any subset (edits). */
  private templateInput(b: any, partial: boolean): { error: string } | { name?: string; type?: WoType; active?: boolean; items?: { label: string; requires_photo: boolean }[] } {
    const out: any = {};
    if (!partial || 'name' in b) {
      const name = label(b.name, 120);
      if (!name) return { error: 'A name (max 120 characters) is required' };
      out.name = name;
    }
    if (!partial || 'type' in b) {
      const type = b.type || 'cleaning';
      if (!WO_TYPES.includes(type)) return { error: 'Invalid type' };
      out.type = type;
    }
    if ('active' in b) out.active = b.active === true || b.active === 'true';
    if (!partial || 'items' in b) {
      if (!Array.isArray(b.items) || !b.items.length) return { error: 'Add at least one step' };
      if (b.items.length > MAX_ITEMS) return { error: `Up to ${MAX_ITEMS} steps` };
      const items = b.items.map((i: any) => ({ label: label(i?.label, 255), requires_photo: i?.requires_photo === true }));
      if (items.some((i: any) => !i.label)) return { error: 'Every step needs text (max 255 characters)' };
      out.items = items;
    }
    return out;
  }

  // ---- manager: templates ----

  async listTemplates(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      res.json({ templates: await this.checklists.listTemplates(company.id, req.query.archived === '1') });
    } catch (error) {
      console.error('Error listing checklists:', error);
      res.status(500).json({ error: 'Failed to load checklists' });
    }
  }

  private async ownedTemplate(req: AuthRequest, res: Response) {
    const company = await this.opsCompany(req, res);
    if (!company) return null;
    const template = await this.checklists.getTemplate(parseInt(req.params.templateId));
    if (!template || template.company_id !== company.id) {
      res.status(404).json({ error: 'Checklist not found' });
      return null;
    }
    return { company, template };
  }

  async getTemplate(req: AuthRequest, res: Response) {
    const found = await this.ownedTemplate(req, res).catch(() => null);
    if (found) res.json({ template: found.template });
  }

  async createTemplate(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const input = this.templateInput(req.body || {}, false);
      if ('error' in input) return res.status(400).json(input);
      res.status(201).json({ template: await this.checklists.createTemplate(company.id, input as any, req.user!.id) });
    } catch (error) {
      console.error('Error creating checklist:', error);
      res.status(500).json({ error: 'Failed to create the checklist' });
    }
  }

  /** Edits apply to jobs that get the checklist from now on; jobs that already have it keep their copy. */
  async updateTemplate(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedTemplate(req, res);
      if (!found) return;
      const input = this.templateInput(req.body || {}, true);
      if ('error' in input) return res.status(400).json(input);
      res.json({ template: await this.checklists.updateTemplate(found.template.id, input) });
    } catch (error) {
      console.error('Error updating checklist:', error);
      res.status(500).json({ error: 'Failed to save the checklist' });
    }
  }

  /** PUT /ops/work-orders/:orderId/checklist { template_id | null } */
  async attachToOrder(req: AuthRequest, res: Response) {
    try {
      const found = await this.ownedOrder(req, res);
      if (!found) return;
      if (['done', 'verified', 'canceled'].includes(found.order.status)) return res.status(409).json({ error: `A ${found.order.status} job's checklist can't be changed` });
      const id = req.body?.template_id ? Number(req.body.template_id) : null;
      if (id) {
        const t = await this.checklists.getTemplate(id);
        if (!t || t.company_id !== found.company.id || !t.active) return res.status(400).json({ error: 'Choose one of your checklists' });
      }
      const result = await this.checklists.attach(found.order.id, id);
      if ('error' in result) return res.status(409).json(result);
      await this.orders.addEvent(found.order.id, req.user!.id, id ? 'checklist_attached' : 'checklist_removed', null, id ? { template_id: id } : null);
      res.json({ checklist: await this.checklistView(found.order.id) });
    } catch (error) {
      console.error('Error attaching checklist:', error);
      res.status(500).json({ error: 'Failed to change the checklist' });
    }
  }

  /** GET /ops/review : submitted jobs with checklist + photos, oldest first. */
  async review(req: AuthRequest, res: Response) {
    try {
      const company = await this.opsCompany(req, res);
      if (!company) return;
      const done = (await this.orders.list(company.id, { status: 'done' })).sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at));
      res.json({
        jobs: await Promise.all(done.map(async o => {
          const time = await this.onsite.entriesFor(o.id);
          return { work_order: o, checklist: await this.checklistView(o.id), photos: await this.onsite.withUrls(o.id),
            minutes_on_site: OnSiteService.minutesOf(time) };
        }))
      });
    } catch (error) {
      console.error('Error loading the review queue:', error);
      res.status(500).json({ error: 'Failed to load the review queue' });
    }
  }

  // ---- worker: tick steps ----

  /** POST /maint/api/jobs/:jobId/checklist/:itemId { done, note? } : only while the job is in progress. */
  async tick(req: AuthRequest, res: Response) {
    try {
      const found = await this.workerOrder(req, res);
      if (!found) return;
      if (found.order.status !== 'in_progress') return res.status(409).json({ error: 'Start the job to work through the checklist' });
      const item = await this.checklists.getJobItem(parseInt(req.params.itemId));
      if (!item || item.work_order_id !== found.order.id) return res.status(404).json({ error: 'Step not found' });
      const note = req.body?.note === undefined || req.body?.note === null || req.body?.note === '' ? item.note : label(req.body.note, 500);
      if (note === null && req.body?.note) return res.status(400).json({ error: 'Note: up to 500 characters' });
      const done = req.body?.done === true;
      const result = await this.checklists.setDone(item, done, req.user!.id, note);
      if ('error' in result) return res.status(409).json(result);
      await this.orders.addEvent(found.order.id, req.user!.id, done ? 'step_done' : 'step_undone', item.label, { checklist_item_id: item.id });
      res.json({ checklist: await this.checklistView(found.order.id) });
    } catch (error) {
      console.error('Error updating checklist step:', error);
      res.status(500).json({ error: 'Failed to update the step' });
    }
  }
}
