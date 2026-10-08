// 2026-10-08 02:40, G7 Ops stage 4: checklist templates and the per-job copy (docs/G7_OPS_PLAN.md).
// A job gets its own copy of the template's items when the checklist is attached, so later template edits never change it.
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockChecklistTemplates, mockChecklistTemplateItems, mockWorkOrderChecklist, mockWorkOrders } from '../utils/mock-database';
import { WoType } from './WorkOrderService';

export const MAX_ITEMS = 60;

export interface TemplateItem { id?: number; label: string; requires_photo: boolean; position: number }
export interface Template { id: number; company_id: number; name: string; type: WoType; active: boolean; items: TemplateItem[]; created_at: Date; updated_at: Date }
export interface JobItem {
  id: number; work_order_id: number; label: string; requires_photo: boolean; position: number;
  done: boolean; done_at: Date | null; done_by: number | null; photo_id: number | null; note: string | null;
}

const nextId = (rows: any[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
const bool = (r: any, k: string) => ({ ...r, [k]: !!r[k] });

export class ChecklistService {
  // ---- templates ----

  async listTemplates(companyId: number, includeArchived = false): Promise<Template[]> {
    const rows: any[] = MOCK_MODE
      ? mockChecklistTemplates.filter(t => t.company_id === companyId)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM checklist_templates WHERE company_id = ? ORDER BY name', [companyId]))[0];
    const out: Template[] = [];
    for (const t of rows.filter(t => includeArchived || t.active)) out.push({ ...bool(t, 'active'), items: await this.templateItems(t.id) });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTemplate(id: number): Promise<Template | null> {
    const t: any = MOCK_MODE
      ? mockChecklistTemplates.find(x => x.id === id)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM checklist_templates WHERE id = ?', [id]))[0][0];
    return t ? { ...bool(t, 'active'), items: await this.templateItems(t.id) } : null;
  }

  private async templateItems(templateId: number): Promise<TemplateItem[]> {
    const rows: any[] = MOCK_MODE
      ? mockChecklistTemplateItems.filter(i => i.template_id === templateId)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY position, id', [templateId]))[0];
    return rows.map(r => ({ id: r.id, label: r.label, requires_photo: !!r.requires_photo, position: r.position })).sort((a, b) => a.position - b.position);
  }

  async createTemplate(companyId: number, data: { name: string; type: WoType; items: { label: string; requires_photo: boolean }[] }, userId: number): Promise<Template> {
    let id: number;
    if (MOCK_MODE) {
      id = nextId(mockChecklistTemplates);
      mockChecklistTemplates.push({ id, company_id: companyId, name: data.name, type: data.type, active: true, created_by: userId, created_at: new Date(), updated_at: new Date() });
    } else {
      const [r] = await db.execute('INSERT INTO checklist_templates (company_id, name, type, created_by) VALUES (?, ?, ?, ?)', [companyId, data.name, data.type, userId]);
      id = (r as any).insertId;
    }
    await this.replaceItems(id, data.items);
    return (await this.getTemplate(id))!;
  }

  async updateTemplate(id: number, data: { name?: string; type?: WoType; active?: boolean; items?: { label: string; requires_photo: boolean }[] }): Promise<Template> {
    const fields: Record<string, any> = {};
    for (const k of ['name', 'type', 'active'] as const) if (data[k] !== undefined) fields[k] = data[k];
    if (MOCK_MODE) {
      Object.assign(mockChecklistTemplates.find(t => t.id === id), fields, { updated_at: new Date() });
    } else if (Object.keys(fields).length) {
      const keys = Object.keys(fields);
      await db.execute(`UPDATE checklist_templates SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => fields[k]), id]);
    }
    if (data.items) await this.replaceItems(id, data.items);
    return (await this.getTemplate(id))!;
  }

  private async replaceItems(templateId: number, items: { label: string; requires_photo: boolean }[]) {
    if (MOCK_MODE) {
      for (let i = mockChecklistTemplateItems.length - 1; i >= 0; i--) if (mockChecklistTemplateItems[i].template_id === templateId) mockChecklistTemplateItems.splice(i, 1);
      items.forEach((it, position) => mockChecklistTemplateItems.push({ id: nextId(mockChecklistTemplateItems), template_id: templateId, label: it.label, requires_photo: it.requires_photo, position }));
      return;
    }
    await db.execute('DELETE FROM checklist_template_items WHERE template_id = ?', [templateId]);
    for (const [position, it] of items.entries()) {
      await db.execute('INSERT INTO checklist_template_items (template_id, label, requires_photo, position) VALUES (?, ?, ?, ?)', [templateId, it.label, it.requires_photo, position]);
    }
  }

  // ---- the job's checklist ----

  async jobItems(orderId: number): Promise<JobItem[]> {
    const rows: any[] = MOCK_MODE
      ? mockWorkOrderChecklist.filter(i => i.work_order_id === orderId)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM work_order_checklist WHERE work_order_id = ? ORDER BY position, id', [orderId]))[0];
    return rows.map(r => ({ ...r, done: !!r.done, requires_photo: !!r.requires_photo })).sort((a, b) => a.position - b.position);
  }

  async getJobItem(itemId: number): Promise<JobItem | null> {
    const r: any = MOCK_MODE
      ? mockWorkOrderChecklist.find(i => i.id === itemId)
      : (await db.execute<RowDataPacket[]>('SELECT * FROM work_order_checklist WHERE id = ?', [itemId]))[0][0];
    return r ? { ...r, done: !!r.done, requires_photo: !!r.requires_photo } : null;
  }

  /** Copies a template onto a job (replacing an untouched checklist), or removes it when templateId is null. */
  async attach(orderId: number, templateId: number | null): Promise<{ error: string } | JobItem[]> {
    const current = await this.jobItems(orderId);
    if (current.some(i => i.done)) return { error: 'Work on this checklist has started; it can no longer be changed' };
    const template = templateId ? await this.getTemplate(templateId) : null;
    if (MOCK_MODE) {
      for (let i = mockWorkOrderChecklist.length - 1; i >= 0; i--) if (mockWorkOrderChecklist[i].work_order_id === orderId) mockWorkOrderChecklist.splice(i, 1);
      for (const it of template?.items || []) {
        mockWorkOrderChecklist.push({ id: nextId(mockWorkOrderChecklist), work_order_id: orderId, label: it.label, requires_photo: it.requires_photo, position: it.position,
          done: false, done_at: null, done_by: null, photo_id: null, note: null });
      }
      mockWorkOrders.find(o => o.id === orderId).checklist_template_id = template?.id ?? null;
    } else {
      await db.execute('DELETE FROM work_order_checklist WHERE work_order_id = ?', [orderId]);
      for (const it of template?.items || []) {
        await db.execute('INSERT INTO work_order_checklist (work_order_id, label, requires_photo, position) VALUES (?, ?, ?, ?)', [orderId, it.label, it.requires_photo, it.position]);
      }
      await db.execute('UPDATE work_orders SET checklist_template_id = ? WHERE id = ?', [template?.id ?? null, orderId]);
    }
    return this.jobItems(orderId);
  }

  /** Ticks or unticks an item. A photo-required item can only be ticked once a photo is linked to it. */
  async setDone(item: JobItem, done: boolean, userId: number, note: string | null): Promise<{ error: string } | JobItem> {
    if (done && item.requires_photo && !item.photo_id) return { error: 'Add a photo for this step first' };
    const fields = { done, done_at: done ? new Date() : null, done_by: done ? userId : null, note };
    if (MOCK_MODE) {
      Object.assign(mockWorkOrderChecklist.find(i => i.id === item.id), fields);
    } else {
      await db.execute('UPDATE work_order_checklist SET done = ?, done_at = ?, done_by = ?, note = ? WHERE id = ?', [fields.done, fields.done_at, fields.done_by, note, item.id]);
    }
    return (await this.getJobItem(item.id))!;
  }

  async linkPhoto(item: JobItem, photoId: number | null): Promise<void> {
    if (MOCK_MODE) {
      const row = mockWorkOrderChecklist.find(i => i.id === item.id);
      row.photo_id = photoId;
      if (!photoId && row.requires_photo) Object.assign(row, { done: false, done_at: null, done_by: null });
      return;
    }
    await db.execute(`UPDATE work_order_checklist SET photo_id = ?${!photoId && item.requires_photo ? ', done = false, done_at = NULL, done_by = NULL' : ''} WHERE id = ?`, [photoId, item.id]);
  }

  /** Items still open; submit is blocked while this is non-empty. */
  async incomplete(orderId: number): Promise<JobItem[]> {
    return (await this.jobItems(orderId)).filter(i => !i.done);
  }

  /** Manager sends work back and reopens specific steps; a reopened photo step needs a new photo. */
  async reopen(orderId: number, itemIds: number[]): Promise<number> {
    const items = (await this.jobItems(orderId)).filter(i => itemIds.includes(i.id));
    for (const it of items) {
      if (MOCK_MODE) {
        Object.assign(mockWorkOrderChecklist.find(i => i.id === it.id), { done: false, done_at: null, done_by: null, photo_id: it.requires_photo ? null : it.photo_id });
      } else {
        await db.execute(`UPDATE work_order_checklist SET done = false, done_at = NULL, done_by = NULL${it.requires_photo ? ', photo_id = NULL' : ''} WHERE id = ?`, [it.id]);
      }
    }
    return items.length;
  }
}
