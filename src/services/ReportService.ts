import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';

const MOCK_MODE = process.env.MOCK_DATABASE === 'true';

export interface GuestReport {
  id?: number;
  property_id: number;
  guest_name?: string;
  guest_room?: string;
  guest_phone?: string;
  category: 'maintenance' | 'supplies' | 'housekeeping' | 'amenities' | 'wifi_tech' | 'noise_complaint' | 'other';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
  location?: string;
  urgency_level: 'not_urgent' | 'same_day' | 'immediate';
  guest_ip?: string;
  resolved_at?: Date;
  resolved_by?: number;
  resolution_notes?: string;
  created_at?: Date;
  updated_at?: Date;
}

class MockReportService {
  private reports: GuestReport[] = [
    {
      id: 1,
      property_id: 1,
      guest_name: "John Smith",
      guest_room: "Master Bedroom",
      guest_phone: "(555) 123-4567",
      category: "maintenance",
      title: "Leaky faucet in kitchen",
      description: "The kitchen sink faucet is dripping constantly. It's been going on for about 2 hours.",
      priority: "medium",
      status: "new",
      location: "Kitchen",
      urgency_level: "same_day",
      guest_ip: "192.168.1.100",
      created_at: new Date('2025-10-04T02:00:00Z'),
      updated_at: new Date('2025-10-04T02:00:00Z')
    },
    {
      id: 2,
      property_id: 1,
      guest_name: "Sarah Johnson",
      guest_room: "Guest Bedroom",
      category: "supplies",
      title: "Out of toilet paper",
      description: "We're running low on toilet paper in the main bathroom. Could we get some more please?",
      priority: "low",
      status: "acknowledged",
      location: "Main Bathroom",
      urgency_level: "not_urgent",
      guest_ip: "192.168.1.101",
      created_at: new Date('2025-10-04T01:30:00Z'),
      updated_at: new Date('2025-10-04T01:45:00Z')
    }
  ];

  async createReport(report: Omit<GuestReport, 'id' | 'created_at' | 'updated_at'>): Promise<GuestReport> {
    const newReport: GuestReport = {
      ...report,
      id: this.reports.length + 1,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    this.reports.push(newReport);
    console.log(`[MOCK] Guest report created: ${newReport.title}`);
    return newReport;
  }

  async getReportsByProperty(propertyId: number): Promise<GuestReport[]> {
    const propertyReports = this.reports.filter(report => report.property_id === propertyId);
    console.log(`[MOCK] Retrieved ${propertyReports.length} reports for property ${propertyId}`);
    return propertyReports;
  }

  async getReportById(id: number): Promise<GuestReport | null> {
    const report = this.reports.find(r => r.id === id);
    if (report) {
      console.log(`[MOCK] Report found: ${report.title}`);
    }
    return report || null;
  }

  async updateReportStatus(id: number, status: GuestReport['status'], resolvedBy?: number, resolutionNotes?: string): Promise<boolean> {
    const reportIndex = this.reports.findIndex(r => r.id === id);
    if (reportIndex === -1) return false;

    this.reports[reportIndex] = {
      ...this.reports[reportIndex],
      status,
      resolved_by: resolvedBy,
      resolution_notes: resolutionNotes,
      resolved_at: status === 'resolved' ? new Date() : undefined,
      updated_at: new Date()
    };

    console.log(`[MOCK] Report ${id} status updated to: ${status}`);
    return true;
  }
}

export class ReportService {
  private mockService = new MockReportService();

  async createReport(report: Omit<GuestReport, 'id' | 'created_at' | 'updated_at'>): Promise<GuestReport> {
    if (MOCK_MODE) {
      return this.mockService.createReport(report);
    }

    try {
      const [result] = await db.execute(
        `INSERT INTO guest_reports (
          property_id, guest_name, guest_room, guest_phone, category, title, description, 
          priority, status, location, urgency_level, guest_ip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          report.property_id,
          report.guest_name || null,
          report.guest_room || null,
          report.guest_phone || null,
          report.category,
          report.title,
          report.description,
          report.priority,
          report.status,
          report.location || null,
          report.urgency_level,
          report.guest_ip || null
        ]
      );

      const insertResult = result as any;
      const newReport: GuestReport = {
        ...report,
        id: insertResult.insertId,
        created_at: new Date(),
        updated_at: new Date()
      };

      console.log(`Guest report created: ${newReport.title}`);
      return newReport;
    } catch (error) {
      console.error('Error creating guest report:', error);
      throw new Error('Failed to create guest report');
    }
  }

  async getReportsByProperty(propertyId: number): Promise<GuestReport[]> {
    if (MOCK_MODE) {
      return this.mockService.getReportsByProperty(propertyId);
    }

    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM guest_reports WHERE property_id = ? ORDER BY created_at DESC',
        [propertyId]
      );

      console.log(`Retrieved ${rows.length} reports for property ${propertyId}`);
      return rows as GuestReport[];
    } catch (error) {
      console.error('Error getting reports by property:', error);
      throw new Error('Failed to retrieve reports');
    }
  }

  async getReportById(id: number): Promise<GuestReport | null> {
    if (MOCK_MODE) {
      return this.mockService.getReportById(id);
    }

    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM guest_reports WHERE id = ?',
        [id]
      );

      if (rows.length === 0) {
        return null;
      }

      const report = rows[0] as GuestReport;
      console.log(`Report found: ${report.title}`);
      return report;
    } catch (error) {
      console.error('Error getting report by id:', error);
      throw new Error('Failed to retrieve report');
    }
  }

  async updateReportStatus(
    id: number, 
    status: GuestReport['status'], 
    resolvedBy?: number, 
    resolutionNotes?: string
  ): Promise<boolean> {
    if (MOCK_MODE) {
      return this.mockService.updateReportStatus(id, status, resolvedBy, resolutionNotes);
    }

    try {
      const [result] = await db.execute(
        `UPDATE guest_reports 
         SET status = ?, resolved_by = ?, resolution_notes = ?, 
             resolved_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          status,
          resolvedBy || null,
          resolutionNotes || null,
          status === 'resolved' ? new Date() : null,
          id
        ]
      );

      const updateResult = result as any;
      const success = updateResult.affectedRows > 0;
      
      if (success) {
        console.log(`Report ${id} status updated to: ${status}`);
      }
      
      return success;
    } catch (error) {
      console.error('Error updating report status:', error);
      throw new Error('Failed to update report status');
    }
  }
}
