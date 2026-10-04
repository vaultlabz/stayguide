// 2026-10-03 22:25, G1 content management: one config-driven service for the tablet's guide content
// (restaurants, how-to videos, local info, announcements) plus the welcome message.
// Column names only ever come from CONTENT_TYPES (never from request bodies).
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../utils/database';
import { buildSetClause } from '../utils/sql';
import { isPlayableVideoUrl } from '../utils/video';
import {
  MOCK_MODE, mockRestaurants, mockVideos, mockLocalInfo, mockAnnouncements, mockPropertyContent
} from '../utils/mock-database';

export type ContentType = 'restaurants' | 'videos' | 'local-info' | 'announcements';

interface TypeConfig {
  table: string;
  fields: string[];
  required: string[];
  enums: Record<string, string[]>;
  maxLen: Record<string, number>;
  urls: string[];          // http(s) URLs (image fields also accept /uploads/ paths)
  imageFields: string[];
  videoField?: string;
  dates: string[];
  orderable: boolean;
  defaultStatus: string;
  mock: () => any[];
}

const TEXT_MAX = 5000;

export const CONTENT_TYPES: Record<ContentType, TypeConfig> = {
  restaurants: {
    table: 'restaurants',
    fields: ['name', 'description', 'category', 'distance', 'rating', 'image_url', 'google_maps_url', 'display_order', 'status'],
    required: ['name'],
    enums: { category: ['breakfast', 'lunch', 'dinner', 'drinks', 'all'], status: ['active', 'inactive'] },
    maxLen: { name: 255, distance: 50, image_url: 500, google_maps_url: 2000, description: TEXT_MAX },
    urls: ['image_url', 'google_maps_url'],
    imageFields: ['image_url'],
    dates: [],
    orderable: true,
    defaultStatus: 'active',
    mock: () => mockRestaurants
  },
  videos: {
    table: 'howto_videos',
    fields: ['title', 'video_url', 'description', 'thumbnail_url', 'display_order', 'status'],
    required: ['title', 'video_url'],
    enums: { status: ['active', 'inactive'] },
    maxLen: { title: 255, video_url: 500, thumbnail_url: 500, description: TEXT_MAX },
    urls: ['thumbnail_url'],
    imageFields: ['thumbnail_url'],
    videoField: 'video_url',
    dates: [],
    orderable: true,
    defaultStatus: 'active',
    mock: () => mockVideos
  },
  'local-info': {
    table: 'local_info',
    fields: ['title', 'category', 'description', 'address', 'phone', 'website_url', 'google_maps_url', 'display_order', 'status'],
    required: ['title', 'category'],
    enums: { category: ['attractions', 'emergency', 'grocery', 'pharmacy', 'transportation', 'other'], status: ['active', 'inactive'] },
    maxLen: { title: 255, phone: 50, website_url: 500, google_maps_url: 2000, address: 1000, description: TEXT_MAX },
    urls: ['website_url', 'google_maps_url'],
    imageFields: [],
    dates: [],
    orderable: true,
    defaultStatus: 'active',
    mock: () => mockLocalInfo
  },
  announcements: {
    table: 'announcements',
    fields: ['title', 'message', 'type', 'scheduled_start', 'scheduled_end', 'status'],
    required: ['title', 'message'],
    enums: { type: ['info', 'warning', 'urgent'], status: ['draft', 'active', 'inactive', 'expired'] },
    maxLen: { title: 255, message: TEXT_MAX },
    urls: [],
    imageFields: [],
    dates: ['scheduled_start', 'scheduled_end'],
    orderable: false,
    defaultStatus: 'active',
    mock: () => mockAnnouncements
  }
};

export const isContentType = (value: string): value is ContentType =>
  Object.prototype.hasOwnProperty.call(CONTENT_TYPES, value);

const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Validate and normalize a request body for a content type.
 * `partial` = update (only provided fields); otherwise create (required fields enforced, defaults applied).
 */
export function validateContent(type: ContentType, body: any, partial: boolean): { fields?: Record<string, any>; error?: string } {
  const cfg = CONTENT_TYPES[type];
  const fields: Record<string, any> = {};
  body = body || {};

  for (const key of cfg.fields) {
    if (body[key] === undefined) continue;
    let value = body[key];

    if (key === 'display_order') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: 'display_order must be a non-negative integer' };
      fields[key] = n;
      continue;
    }
    if (key === 'rating') {
      if (value === '' || value === null) { fields[key] = null; continue; }
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 5) return { error: 'rating must be between 0 and 5' };
      fields[key] = Math.round(n * 100) / 100;
      continue;
    }

    value = typeof value === 'string' ? value.trim() : value;
    if (value === '' || value === null) {
      if (cfg.required.includes(key)) return { error: `${key} is required` };
      fields[key] = null;
      continue;
    }
    if (typeof value !== 'string') return { error: `${key} must be text` };

    if (cfg.maxLen[key] && value.length > cfg.maxLen[key]) return { error: `${key} is too long (max ${cfg.maxLen[key]})` };
    if (cfg.enums[key] && !cfg.enums[key].includes(value)) return { error: `${key} must be one of: ${cfg.enums[key].join(', ')}` };
    if (cfg.videoField === key && !isPlayableVideoUrl(value)) {
      return { error: 'video_url must be a YouTube or Vimeo link, or an uploaded video file' };
    }
    if (cfg.urls.includes(key)) {
      const uploadPath = cfg.imageFields.includes(key) && value.startsWith('/uploads/') && !value.includes('..');
      if (!uploadPath && !isHttpUrl(value)) return { error: `${key} must be an http(s) URL` };
    }
    if (cfg.dates.includes(key)) {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return { error: `${key} must be a valid date/time` };
      fields[key] = d;
      continue;
    }
    fields[key] = value;
  }

  if (!partial) {
    for (const key of cfg.required) {
      if (fields[key] === undefined || fields[key] === null) return { error: `${key} is required` };
    }
    if (fields.status === undefined) fields.status = cfg.defaultStatus;
  }

  const start = fields.scheduled_start, end = fields.scheduled_end;
  if (start instanceof Date && end instanceof Date && end < start) {
    return { error: 'scheduled_end must be after scheduled_start' };
  }
  return { fields };
}

export class ContentService {
  async list(type: ContentType, propertyId: number): Promise<any[]> {
    const cfg = CONTENT_TYPES[type];
    if (MOCK_MODE) {
      return cfg.mock()
        .filter(r => r.property_id === propertyId)
        .sort((a, b) => cfg.orderable ? (a.display_order ?? 0) - (b.display_order ?? 0) : (b.id - a.id));
    }
    const order = cfg.orderable ? 'display_order, id' : 'created_at DESC, id DESC';
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM ${cfg.table} WHERE property_id = ? ORDER BY ${order}`, [propertyId]);
    return rows;
  }

  async create(type: ContentType, propertyId: number, fields: Record<string, any>, userId: number): Promise<any> {
    const cfg = CONTENT_TYPES[type];
    const row: Record<string, any> = { ...fields, property_id: propertyId };
    if (type === 'announcements') row.created_by = userId;
    if (cfg.orderable && row.display_order === undefined) {
      const existing = await this.list(type, propertyId);
      row.display_order = existing.reduce((max, r) => Math.max(max, r.display_order ?? 0), 0) + 1;
    }

    if (MOCK_MODE) {
      const rows = cfg.mock();
      const created = { id: rows.reduce((m, r) => Math.max(m, r.id), 0) + 1, ...row, created_at: new Date() };
      rows.push(created);
      return created;
    }

    const cols = Object.keys(row);
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map(c => row[c])
    );
    return this.findOne(type, propertyId, result.insertId);
  }

  async findOne(type: ContentType, propertyId: number, id: number): Promise<any | null> {
    const cfg = CONTENT_TYPES[type];
    if (MOCK_MODE) return cfg.mock().find(r => r.id === id && r.property_id === propertyId) || null;
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM ${cfg.table} WHERE id = ? AND property_id = ?`, [id, propertyId]);
    return rows[0] || null;
  }

  /** Update scoped to the property, so ids from other properties/companies can't be touched. */
  async update(type: ContentType, propertyId: number, id: number, fields: Record<string, any>): Promise<any | null> {
    const cfg = CONTENT_TYPES[type];
    if (MOCK_MODE) {
      const row = cfg.mock().find(r => r.id === id && r.property_id === propertyId);
      if (!row) return null;
      Object.assign(row, fields, { updated_at: new Date() });
      return row;
    }
    if (Object.keys(fields).length) {
      const { setClause, values } = buildSetClause(fields);
      const [result] = await db.execute<ResultSetHeader>(
        `UPDATE ${cfg.table} SET ${setClause} WHERE id = ? AND property_id = ?`, [...values, id, propertyId]
      );
      if (result.affectedRows === 0) return null;
    }
    return this.findOne(type, propertyId, id);
  }

  async remove(type: ContentType, propertyId: number, id: number): Promise<boolean> {
    const cfg = CONTENT_TYPES[type];
    if (MOCK_MODE) {
      const rows = cfg.mock();
      const index = rows.findIndex(r => r.id === id && r.property_id === propertyId);
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    }
    const [result] = await db.execute<ResultSetHeader>(`DELETE FROM ${cfg.table} WHERE id = ? AND property_id = ?`, [id, propertyId]);
    return result.affectedRows > 0;
  }

  /** Set display_order to the position in `ids`. All ids must belong to the property. */
  async reorder(type: ContentType, propertyId: number, ids: number[]): Promise<boolean> {
    const existing = await this.list(type, propertyId);
    const owned = new Set(existing.map(r => r.id));
    if (ids.length !== existing.length || !ids.every(id => owned.has(id)) || new Set(ids).size !== ids.length) return false;
    for (let i = 0; i < ids.length; i++) {
      await this.update(type, propertyId, ids[i], { display_order: i + 1 });
    }
    return true;
  }

  async getWelcome(propertyId: number): Promise<string | null> {
    if (MOCK_MODE) return mockPropertyContent.find(c => c.property_id === propertyId)?.welcome_message ?? null;
    const [rows] = await db.execute<RowDataPacket[]>('SELECT welcome_message FROM property_content WHERE property_id = ?', [propertyId]);
    return rows[0]?.welcome_message ?? null;
  }

  async setWelcome(propertyId: number, message: string | null): Promise<void> {
    if (MOCK_MODE) {
      const row = mockPropertyContent.find(c => c.property_id === propertyId);
      if (row) row.welcome_message = message;
      else mockPropertyContent.push({ id: mockPropertyContent.length + 1, property_id: propertyId, welcome_message: message, weather_widget: true });
      return;
    }
    const [rows] = await db.execute<RowDataPacket[]>('SELECT id FROM property_content WHERE property_id = ?', [propertyId]);
    if (rows.length) {
      await db.execute('UPDATE property_content SET welcome_message = ? WHERE property_id = ?', [message, propertyId]);
    } else {
      await db.execute('INSERT INTO property_content (property_id, welcome_message) VALUES (?, ?)', [propertyId, message]);
    }
  }
}
