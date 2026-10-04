import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../utils/database';

export interface GuestReport {
  id?: number;
  property_id: number;
  amenity_id?: number | null;
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
  source?: 'tablet' | 'guest_link'; // 2026-10-03 22:42
  guest_ip?: string;
  resolved_at?: Date | null;
  resolved_by?: number | null;
  resolution_notes?: string;
  admin_notified: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface GuestReportWithAmenity extends GuestReport {
  amenity_name?: string;
  amenity_category?: string;
}

export class IntegratedReportService {
  
  /**
   * Create a new guest report with amenity awareness
   */
  async createReport(reportData: Omit<GuestReport, 'id' | 'created_at' | 'updated_at'>): Promise<GuestReport> {
    const query = `
      INSERT INTO guest_reports (
        property_id, amenity_id, guest_name, guest_room, guest_phone,
        category, title, description, priority, status, location,
        urgency_level, source, guest_ip, admin_notified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      reportData.property_id,
      reportData.amenity_id || null,
      reportData.guest_name || null,
      reportData.guest_room || null,
      reportData.guest_phone || null,
      reportData.category,
      reportData.title,
      reportData.description,
      reportData.priority,
      reportData.status || 'new',
      reportData.location || null,
      reportData.urgency_level,
      reportData.source || 'tablet', // 2026-10-03 22:42
      reportData.guest_ip || null,
      reportData.admin_notified || false
    ];
    
    const [result] = await db.execute<ResultSetHeader>(query, values);
    
    // Log the guest action
    await this.logGuestAction('guest_reports', result.insertId, 'created', reportData);
    
    // Notify Super Admin for urgent amenity issues
    if (reportData.amenity_id && (reportData.priority === 'urgent' || reportData.urgency_level === 'immediate')) {
      await this.notifySuperAdminForAmenityIssues(result.insertId);
    }
    
    return this.getReportById(result.insertId);
  }
  
  /**
   * Get report by ID with amenity information
   */
  async getReportById(id: number): Promise<GuestReport> {
    const query = `
      SELECT gr.*, a.name as amenity_name, a.category as amenity_category
      FROM guest_reports gr
      LEFT JOIN amenities a ON gr.amenity_id = a.id
      WHERE gr.id = ?
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query, [id]);
    if (rows.length === 0) {
      throw new Error('Report not found');
    }
    
    return rows[0] as GuestReportWithAmenity;
  }
  
  /**
   * Get all reports for a property with amenity information
   */
  async getReportsByProperty(propertyId: number): Promise<GuestReportWithAmenity[]> {
    const query = `
      SELECT gr.*, a.name as amenity_name, a.category as amenity_category
      FROM guest_reports gr
      LEFT JOIN amenities a ON gr.amenity_id = a.id
      WHERE gr.property_id = ?
      ORDER BY gr.created_at DESC
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query, [propertyId]);
    return rows as GuestReportWithAmenity[];
  }
  
  /**
   * Get reports filtered by amenity
   */
  async getReportsByAmenity(amenityId: number): Promise<GuestReportWithAmenity[]> {
    const query = `
      SELECT gr.*, a.name as amenity_name, a.category as amenity_category
      FROM guest_reports gr
      LEFT JOIN amenities a ON gr.amenity_id = a.id
      WHERE gr.amenity_id = ?
      ORDER BY gr.created_at DESC
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query, [amenityId]);
    return rows as GuestReportWithAmenity[];
  }
  
  /**
   * Get all reports across all properties (Super Admin only)
   */
  async getAllReports(): Promise<GuestReportWithAmenity[]> {
    const query = `
      SELECT gr.*, a.name as amenity_name, a.category as amenity_category,
             p.name as property_name, c.name as company_name
      FROM guest_reports gr
      LEFT JOIN amenities a ON gr.amenity_id = a.id
      LEFT JOIN properties p ON gr.property_id = p.id
      LEFT JOIN companies c ON p.company_id = c.id
      ORDER BY gr.created_at DESC
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query);
    return rows as (GuestReportWithAmenity & { property_name: string; company_name: string })[];
  }
  
  /**
   * Update report status (Company Admin or Super Admin)
   */
  async updateReportStatus(
    id: number, 
    status: GuestReport['status'], 
    resolvedBy?: number, 
    resolutionNotes?: string
  ): Promise<GuestReport> {
    const query = `
      UPDATE guest_reports 
      SET status = ?, resolved_by = ?, resolution_notes = ?, 
          resolved_at = ${status === 'resolved' || status === 'closed' ? 'NOW()' : 'NULL'}
      WHERE id = ?
    `;
    
    await db.execute(query, [status, resolvedBy || null, resolutionNotes || null, id]);
    
    // Log the admin action
    if (resolvedBy) {
      await this.logAdminAction('guest_reports', id, 'updated', { status, resolution_notes: resolutionNotes }, resolvedBy);
    }
    
    return this.getReportById(id);
  }
  
  /**
   * Notify Super Admin for urgent amenity issues
   */
  async notifySuperAdminForAmenityIssues(reportId: number): Promise<void> {
    // Mark as admin notified
    await db.execute(
      'UPDATE guest_reports SET admin_notified = true WHERE id = ?',
      [reportId]
    );
    
    // In a real implementation, this would send email/SMS/push notifications
    console.log(`🚨 SUPER ADMIN ALERT: Urgent amenity issue reported - Report ID: ${reportId}`);
    
    // Log the notification
    await this.logSystemAction('guest_reports', reportId, 'admin_notified', { notification_sent: true });
  }
  
  /**
   * Get reports that need Super Admin attention
   */
  async getReportsNeedingAdminAttention(): Promise<GuestReportWithAmenity[]> {
    const query = `
      SELECT gr.*, a.name as amenity_name, a.category as amenity_category,
             p.name as property_name, c.name as company_name
      FROM guest_reports gr
      LEFT JOIN amenities a ON gr.amenity_id = a.id
      LEFT JOIN properties p ON gr.property_id = p.id
      LEFT JOIN companies c ON p.company_id = c.id
      WHERE (gr.priority = 'urgent' OR gr.urgency_level = 'immediate')
        AND gr.status IN ('new', 'acknowledged')
        AND gr.amenity_id IS NOT NULL
      ORDER BY gr.created_at DESC
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query);
    return rows as (GuestReportWithAmenity & { property_name: string; company_name: string })[];
  }
  
  /**
   * Auto-close amenity reports when amenity is fixed/updated by Super Admin
   */
  async autoCloseAmenityReports(amenityId: number, resolvedBy: number, notes: string): Promise<number> {
    const query = `
      UPDATE guest_reports 
      SET status = 'resolved', resolved_by = ?, resolution_notes = ?, resolved_at = NOW()
      WHERE amenity_id = ? AND status IN ('new', 'acknowledged', 'in_progress')
    `;
    
    const [result] = await db.execute<ResultSetHeader>(query, [resolvedBy, notes, amenityId]);
    
    // Log the bulk resolution
    if (result.affectedRows > 0) {
      await this.logAdminAction('guest_reports', amenityId, 'bulk_resolved', {
        affected_reports: result.affectedRows,
        resolution_notes: notes
      }, resolvedBy);
    }
    
    return result.affectedRows;
  }
  
  /**
   * Log guest actions in audit trail
   */
  private async logGuestAction(tableName: string, recordId: number, action: string, data: any): Promise<void> {
    const query = `
      INSERT INTO system_audit_log (table_name, record_id, action, user_type, new_values, ip_address)
      VALUES (?, ?, ?, 'guest', ?, ?)
    `;
    
    await db.execute(query, [
      tableName,
      recordId,
      action,
      JSON.stringify(data),
      data.guest_ip || null
    ]);
  }
  
  /**
   * Log admin actions in audit trail
   */
  private async logAdminAction(tableName: string, recordId: number, action: string, data: any, userId: number): Promise<void> {
    // Determine user type
    const userQuery = 'SELECT role FROM users WHERE id = ?';
    const [userRows] = await db.execute<RowDataPacket[]>(userQuery, [userId]);
    const userType = userRows[0]?.role || 'company_admin';
    
    const query = `
      INSERT INTO system_audit_log (table_name, record_id, action, changed_by, user_type, new_values)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    await db.execute(query, [
      tableName,
      recordId,
      action,
      userId,
      userType,
      JSON.stringify(data)
    ]);
  }
  
  /**
   * Log system actions in audit trail
   */
  private async logSystemAction(tableName: string, recordId: number, action: string, data: any): Promise<void> {
    const query = `
      INSERT INTO system_audit_log (table_name, record_id, action, user_type, new_values, notes)
      VALUES (?, ?, ?, 'guest', ?, 'System automated action')
    `;
    
    await db.execute(query, [
      tableName,
      recordId,
      action,
      JSON.stringify(data)
    ]);
  }
}
