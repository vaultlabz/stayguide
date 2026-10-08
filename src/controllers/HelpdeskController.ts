// 2026-10-07 16:00, helpdesk endpoints: company admins (/company/:companySlug/helpdesk/...) and super admin (/admin/helpdesk/...)
import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { HelpdeskService, TICKET_PRIORITIES, TICKET_STATUSES, TicketPriority, TicketStatus, Ticket } from '../services/HelpdeskService';
import { EmailService } from '../services/EmailService';
import { CompanyService } from '../services/CompanyService';
import { resolveOwnedCompany } from '../utils/ownership';

const SUBJECT_MAX = 255;
const MESSAGE_MAX = 10000;

const baseUrl = (req: Request) => (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const supportEmail = () => process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || 'support@stayguide.com';

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v && v.length <= max ? v : null;
}

export class HelpdeskController {
  private helpdesk = new HelpdeskService();
  private email = new EmailService();
  private companies = new CompanyService();

  /** Email is best-effort: a failed send never fails the request. */
  private notify(to: string, subject: string, intro: string, ticket: Ticket, body: string, link: string) {
    const html = `<p>${esc(intro)}</p><p><strong>#${ticket.id}: ${esc(ticket.subject)}</strong></p>`
      + `<blockquote style="border-left:3px solid #ccc;margin:0;padding:0 12px;white-space:pre-wrap">${esc(body)}</blockquote>`
      + `<p><a href="${link}">Open the ticket</a></p>`;
    const text = `${intro}\n\n#${ticket.id}: ${ticket.subject}\n\n${body}\n\nOpen the ticket: ${link}`;
    this.email.sendEmail({ to, subject, html, text }).catch(err => console.error('Helpdesk email failed:', err));
  }

  // ---- company admin ----

  async companyList(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      res.json({ tickets: await this.helpdesk.listTickets(company.id) });
    } catch (error) {
      console.error('Error listing tickets:', error);
      res.status(500).json({ error: 'Failed to load tickets' });
    }
  }

  async companyCreate(req: AuthRequest, res: Response) {
    try {
      const company = await resolveOwnedCompany(req, res);
      if (!company) return;
      const subject = cleanText(req.body?.subject, SUBJECT_MAX);
      const message = cleanText(req.body?.message, MESSAGE_MAX);
      const priority = (req.body?.priority || 'medium') as TicketPriority;
      if (!subject || !message) return res.status(400).json({ error: `Subject (max ${SUBJECT_MAX}) and message (max ${MESSAGE_MAX}) are required` });
      if (!TICKET_PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });

      const ticket = await this.helpdesk.createTicket({ company_id: company.id, created_by: req.user!.id, subject, message, priority });
      console.log(`Helpdesk ticket #${ticket.id} opened by ${req.user?.email} (${company.slug})`);
      this.notify(supportEmail(), `[StayGuide support] New ${priority} ticket #${ticket.id} from ${company.name}`,
        `${company.name} opened a support ticket.`, ticket, message, `${baseUrl(req)}/admin/helpdesk?ticket=${ticket.id}`);
      res.status(201).json({ message: 'Ticket created', ticket });
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: 'Failed to create ticket' });
    }
  }

  /** Loads the ticket and checks it belongs to the company in the URL. */
  private async ownedTicket(req: AuthRequest, res: Response): Promise<Ticket | null> {
    const company = await resolveOwnedCompany(req, res);
    if (!company) return null;
    const ticket = await this.helpdesk.getTicket(parseInt(req.params.ticketId));
    if (!ticket || ticket.company_id !== company.id) {
      res.status(404).json({ error: 'Ticket not found' });
      return null;
    }
    return ticket;
  }

  async companyGet(req: AuthRequest, res: Response) {
    try {
      const ticket = await this.ownedTicket(req, res);
      if (!ticket) return;
      res.json({ ticket, responses: await this.helpdesk.getResponses(ticket.id, false) });
    } catch (error) {
      console.error('Error loading ticket:', error);
      res.status(500).json({ error: 'Failed to load ticket' });
    }
  }

  async companyReply(req: AuthRequest, res: Response) {
    try {
      const ticket = await this.ownedTicket(req, res);
      if (!ticket) return;
      const message = cleanText(req.body?.message, MESSAGE_MAX);
      if (!message) return res.status(400).json({ error: 'Message is required' });
      const response = await this.helpdesk.addResponse(ticket.id, req.user!.id, message, false);
      // a reply from the customer reopens a resolved or closed ticket
      if (ticket.status === 'resolved' || ticket.status === 'closed') await this.helpdesk.setStatus(ticket.id, 'open');
      this.notify(supportEmail(), `[StayGuide support] Reply on ticket #${ticket.id}`,
        `${ticket.company_name} replied to a support ticket.`, ticket, message, `${baseUrl(req)}/admin/helpdesk?ticket=${ticket.id}`);
      res.status(201).json({ message: 'Reply added', response });
    } catch (error) {
      console.error('Error replying to ticket:', error);
      res.status(500).json({ error: 'Failed to add reply' });
    }
  }

  async companyClose(req: AuthRequest, res: Response) {
    try {
      const ticket = await this.ownedTicket(req, res);
      if (!ticket) return;
      res.json({ message: 'Ticket closed', ticket: await this.helpdesk.setStatus(ticket.id, 'closed') });
    } catch (error) {
      console.error('Error closing ticket:', error);
      res.status(500).json({ error: 'Failed to close ticket' });
    }
  }

  // ---- super admin ----

  async adminList(req: AuthRequest, res: Response) {
    try {
      const status = req.query.status as TicketStatus | undefined;
      if (status && !TICKET_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      res.json({ tickets: await this.helpdesk.listTickets(null, status) });
    } catch (error) {
      console.error('Error listing tickets:', error);
      res.status(500).json({ error: 'Failed to load tickets' });
    }
  }

  async adminGet(req: AuthRequest, res: Response) {
    try {
      const ticket = await this.helpdesk.getTicket(parseInt(req.params.ticketId));
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      res.json({ ticket, responses: await this.helpdesk.getResponses(ticket.id, true) });
    } catch (error) {
      console.error('Error loading ticket:', error);
      res.status(500).json({ error: 'Failed to load ticket' });
    }
  }

  async adminReply(req: AuthRequest, res: Response) {
    try {
      const ticket = await this.helpdesk.getTicket(parseInt(req.params.ticketId));
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const message = cleanText(req.body?.message, MESSAGE_MAX);
      if (!message) return res.status(400).json({ error: 'Message is required' });
      const isInternal = req.body?.is_internal === true;
      const response = await this.helpdesk.addResponse(ticket.id, req.user!.id, message, isInternal);
      // first public answer moves an open ticket to in progress
      if (!isInternal && ticket.status === 'open') await this.helpdesk.setStatus(ticket.id, 'in_progress');
      if (!isInternal) {
        const company = await this.companies.findById(ticket.company_id);
        if (company?.email) {
          this.notify(company.email, `Re: [StayGuide support] #${ticket.id} ${ticket.subject}`,
            'StayGuide support replied to your ticket.', ticket, message,
            `${baseUrl(req)}/company/${company.slug}/helpdesk?ticket=${ticket.id}`);
        }
      }
      res.status(201).json({ message: 'Reply added', response });
    } catch (error) {
      console.error('Error replying to ticket:', error);
      res.status(500).json({ error: 'Failed to add reply' });
    }
  }

  async adminSetStatus(req: AuthRequest, res: Response) {
    try {
      const status = req.body?.status as TicketStatus;
      if (!TICKET_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      const ticket = await this.helpdesk.setStatus(parseInt(req.params.ticketId), status);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      res.json({ message: 'Status updated', ticket });
    } catch (error) {
      console.error('Error updating ticket status:', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
}
