// 2026-10-07 16:00, helpdesk: company admins open tickets, the super admin answers them.
// Uses the existing helpdesk_tickets / helpdesk_responses tables (database/schema.sql); the ticket's
// `message` is the opening message, replies live in helpdesk_responses. is_internal notes are admin-only.
import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { MOCK_MODE, mockHelpdeskTickets, mockHelpdeskResponses, mockUsers, mockCompanies } from '../utils/mock-database';

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketPriority = typeof TICKET_PRIORITIES[number];
export type TicketStatus = typeof TICKET_STATUSES[number];

export interface Ticket {
  id: number;
  company_id: number;
  company_name?: string;
  created_by: number;
  author_name?: string;
  subject: string;
  message: string;
  priority: TicketPriority;
  status: TicketStatus;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
  response_count?: number;
}

export interface TicketResponse {
  id: number;
  ticket_id: number;
  user_id: number;
  author_name?: string;
  author_role?: string;
  message: string;
  is_internal: boolean;
  created_at: Date;
}

const userName = (id: number) => {
  const u: any = mockUsers.find(x => x.id === id);
  return u ? `${u.first_name} ${u.last_name}` : 'Unknown';
};
const userRole = (id: number) => (mockUsers.find(x => x.id === id) as any)?.role;
const companyName = (id: number) => mockCompanies.find(c => c.id === id)?.name;

export class HelpdeskService {
  /** companyId = null lists every company's tickets (super admin). */
  async listTickets(companyId: number | null, status?: TicketStatus): Promise<Ticket[]> {
    if (MOCK_MODE) {
      return mockHelpdeskTickets
        .filter(t => (companyId === null || t.company_id === companyId) && (!status || t.status === status))
        .map(t => ({
          ...t,
          company_name: companyName(t.company_id),
          author_name: userName(t.created_by),
          response_count: mockHelpdeskResponses.filter(r => r.ticket_id === t.id && (companyId === null || !r.is_internal)).length
        }))
        .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    }
    const where: string[] = [];
    const params: any[] = [];
    if (companyId !== null) { where.push('t.company_id = ?'); params.push(companyId); }
    if (status) { where.push('t.status = ?'); params.push(status); }
    const internal = companyId === null ? '' : 'AND r.is_internal = false';
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT t.*, c.name AS company_name, CONCAT(u.first_name, ' ', u.last_name) AS author_name,
              (SELECT COUNT(*) FROM helpdesk_responses r WHERE r.ticket_id = t.id ${internal}) AS response_count
         FROM helpdesk_tickets t
         JOIN companies c ON c.id = t.company_id
         JOIN users u ON u.id = t.created_by
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY t.updated_at DESC`,
      params
    );
    return rows as Ticket[];
  }

  async getTicket(id: number): Promise<Ticket | null> {
    if (MOCK_MODE) {
      const t = mockHelpdeskTickets.find(x => x.id === id);
      return t ? { ...t, company_name: companyName(t.company_id), author_name: userName(t.created_by) } : null;
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT t.*, c.name AS company_name, CONCAT(u.first_name, ' ', u.last_name) AS author_name
         FROM helpdesk_tickets t JOIN companies c ON c.id = t.company_id JOIN users u ON u.id = t.created_by
        WHERE t.id = ?`,
      [id]
    );
    return (rows[0] as Ticket) || null;
  }

  async getResponses(ticketId: number, includeInternal: boolean): Promise<TicketResponse[]> {
    if (MOCK_MODE) {
      return mockHelpdeskResponses
        .filter(r => r.ticket_id === ticketId && (includeInternal || !r.is_internal))
        .map(r => ({ ...r, author_name: userName(r.user_id), author_role: userRole(r.user_id) }));
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT r.*, CONCAT(u.first_name, ' ', u.last_name) AS author_name, u.role AS author_role
         FROM helpdesk_responses r JOIN users u ON u.id = r.user_id
        WHERE r.ticket_id = ? ${includeInternal ? '' : 'AND r.is_internal = false'}
        ORDER BY r.created_at ASC`,
      [ticketId]
    );
    return rows.map(r => ({ ...r, is_internal: !!r.is_internal })) as TicketResponse[];
  }

  async createTicket(data: { company_id: number; created_by: number; subject: string; message: string; priority: TicketPriority }): Promise<Ticket> {
    if (MOCK_MODE) {
      const now = new Date();
      const ticket = {
        id: (mockHelpdeskTickets.reduce((m, t) => Math.max(m, t.id), 0)) + 1,
        ...data, status: 'open', assigned_to: null, resolved_at: null, created_at: now, updated_at: now
      };
      mockHelpdeskTickets.push(ticket);
      return (await this.getTicket(ticket.id))!;
    }
    const [result] = await db.execute(
      'INSERT INTO helpdesk_tickets (company_id, created_by, subject, message, priority) VALUES (?, ?, ?, ?, ?)',
      [data.company_id, data.created_by, data.subject, data.message, data.priority]
    );
    return (await this.getTicket((result as any).insertId))!;
  }

  async addResponse(ticketId: number, userId: number, message: string, isInternal: boolean): Promise<TicketResponse> {
    if (MOCK_MODE) {
      const response = {
        id: (mockHelpdeskResponses.reduce((m, r) => Math.max(m, r.id), 0)) + 1,
        ticket_id: ticketId, user_id: userId, message, is_internal: isInternal, created_at: new Date()
      };
      mockHelpdeskResponses.push(response);
      const t = mockHelpdeskTickets.find(x => x.id === ticketId);
      if (t) t.updated_at = new Date();
      return { ...response, author_name: userName(userId), author_role: userRole(userId) };
    }
    const [result] = await db.execute(
      'INSERT INTO helpdesk_responses (ticket_id, user_id, message, is_internal) VALUES (?, ?, ?, ?)',
      [ticketId, userId, message, isInternal]
    );
    await db.execute('UPDATE helpdesk_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [ticketId]);
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT r.*, CONCAT(u.first_name, ' ', u.last_name) AS author_name, u.role AS author_role
         FROM helpdesk_responses r JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
      [(result as any).insertId]
    );
    return { ...rows[0], is_internal: !!rows[0].is_internal } as TicketResponse;
  }

  async setStatus(ticketId: number, status: TicketStatus): Promise<Ticket | null> {
    const resolved = status === 'resolved' || status === 'closed';
    if (MOCK_MODE) {
      const t = mockHelpdeskTickets.find(x => x.id === ticketId);
      if (!t) return null;
      t.status = status;
      t.resolved_at = resolved ? (t.resolved_at || new Date()) : null;
      t.updated_at = new Date();
      return this.getTicket(ticketId);
    }
    await db.execute(
      `UPDATE helpdesk_tickets SET status = ?, resolved_at = ${resolved ? 'COALESCE(resolved_at, CURRENT_TIMESTAMP)' : 'NULL'} WHERE id = ?`,
      [status, ticketId]
    );
    return this.getTicket(ticketId);
  }
}
