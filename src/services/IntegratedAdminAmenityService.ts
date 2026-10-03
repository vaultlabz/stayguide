import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../utils/database';
import { IntegratedReportService, GuestReportWithAmenity } from './IntegratedReportService';

export interface GlobalAmenityTemplate {
  id?: number;
  name: string;
  description?: string;
  icon?: string;
  category: 'recreation' | 'comfort' | 'kitchen' | 'location' | 'technology' | 'safety' | 'general';
  is_standard: boolean;
  created_by: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface AmenityWithReports {
  id: number;
  property_id: number;
  name: string;
  description?: string;
  icon?: string;
  image_url?: string;
  category: string;
  display_order: number;
  status: string;
  created_by?: number;
  approved_by_admin?: number;
  is_admin_managed: boolean;
  template_id?: number;
  created_at: Date;
  updated_at: Date;
  active_reports_count: number;
  urgent_reports_count: number;
  recent_reports: GuestReportWithAmenity[];
}

export interface BulkAmenityUpdate {
  property_id: number;
  amenity_updates: {
    id?: number;
    name: string;
    description?: string;
    icon?: string;
    image_url?: string;
    category: string;
    display_order: number;
    template_id?: number;
  }[];
}

export interface BulkUpdateResult {
  success: boolean;
  updated_properties: number;
  updated_amenities: number;
  warnings: string[];
  errors: string[];
}

export class IntegratedAdminAmenityService {
  private reportService: IntegratedReportService;
  
  constructor() {
    this.reportService = new IntegratedReportService();
  }
  
  /**
   * Get amenity with associated reports information
   */
  async getAmenityWithReports(amenityId: number): Promise<AmenityWithReports> {
    const amenityQuery = `
      SELECT a.*, p.name as property_name, c.name as company_name
      FROM amenities a
      JOIN properties p ON a.property_id = p.id
      JOIN companies c ON p.company_id = c.id
      WHERE a.id = ?
    `;
    
    const [amenityRows] = await db.execute<RowDataPacket[]>(amenityQuery, [amenityId]);
    if (amenityRows.length === 0) {
      throw new Error('Amenity not found');
    }
    
    const amenity = amenityRows[0];
    
    // Get report counts
    const reportCountQuery = `
      SELECT 
        COUNT(*) as active_reports_count,
        SUM(CASE WHEN priority = 'urgent' OR urgency_level = 'immediate' THEN 1 ELSE 0 END) as urgent_reports_count
      FROM guest_reports 
      WHERE amenity_id = ? AND status IN ('new', 'acknowledged', 'in_progress')
    `;
    
    const [countRows] = await db.execute<RowDataPacket[]>(reportCountQuery, [amenityId]);
    const counts = countRows[0];
    
    // Get recent reports
    const recentReports = await this.reportService.getReportsByAmenity(amenityId);
    
    return {
      ...amenity,
      active_reports_count: counts.active_reports_count || 0,
      urgent_reports_count: counts.urgent_reports_count || 0,
      recent_reports: recentReports.slice(0, 5) // Last 5 reports
    } as AmenityWithReports;
  }
  
  /**
   * Get all amenities across all properties (Super Admin only)
   */
  async getAllAmenitiesWithReports(): Promise<AmenityWithReports[]> {
    const query = `
      SELECT a.*, p.name as property_name, c.name as company_name,
             COALESCE(report_counts.active_reports, 0) as active_reports_count,
             COALESCE(report_counts.urgent_reports, 0) as urgent_reports_count
      FROM amenities a
      JOIN properties p ON a.property_id = p.id
      JOIN companies c ON p.company_id = c.id
      LEFT JOIN (
        SELECT amenity_id,
               COUNT(*) as active_reports,
               SUM(CASE WHEN priority = 'urgent' OR urgency_level = 'immediate' THEN 1 ELSE 0 END) as urgent_reports
        FROM guest_reports 
        WHERE status IN ('new', 'acknowledged', 'in_progress')
        GROUP BY amenity_id
      ) report_counts ON a.id = report_counts.amenity_id
      ORDER BY urgent_reports_count DESC, active_reports_count DESC, a.created_at DESC
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query);
    
    // Get recent reports for each amenity (limited to avoid performance issues)
    const amenitiesWithReports = await Promise.all(
      rows.map(async (amenity) => {
        const recentReports = await this.reportService.getReportsByAmenity(amenity.id);
        return {
          ...amenity,
          recent_reports: recentReports.slice(0, 3) // Last 3 reports per amenity
        } as AmenityWithReports;
      })
    );
    
    return amenitiesWithReports;
  }
  
  /**
   * Create global amenity template (Super Admin only)
   */
  async createGlobalTemplate(templateData: Omit<GlobalAmenityTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<GlobalAmenityTemplate> {
    const query = `
      INSERT INTO global_amenity_templates (name, description, icon, category, is_standard, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      templateData.name,
      templateData.description || null,
      templateData.icon || null,
      templateData.category,
      templateData.is_standard,
      templateData.created_by
    ];
    
    const [result] = await db.execute<ResultSetHeader>(query, values);
    
    // Log the action
    await this.logAdminAction('global_amenity_templates', result.insertId, 'created', templateData, templateData.created_by);
    
    return this.getGlobalTemplate(result.insertId);
  }
  
  /**
   * Get all global amenity templates
   */
  async getGlobalTemplates(): Promise<GlobalAmenityTemplate[]> {
    const query = `
      SELECT * FROM global_amenity_templates 
      ORDER BY is_standard DESC, category, name
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query);
    return rows as GlobalAmenityTemplate[];
  }
  
  /**
   * Get global template by ID
   */
  async getGlobalTemplate(id: number): Promise<GlobalAmenityTemplate> {
    const query = 'SELECT * FROM global_amenity_templates WHERE id = ?';
    const [rows] = await db.execute<RowDataPacket[]>(query, [id]);
    
    if (rows.length === 0) {
      throw new Error('Template not found');
    }
    
    return rows[0] as GlobalAmenityTemplate;
  }
  
  /**
   * Apply template to multiple properties with report impact analysis
   */
  async applyTemplateWithReportHandling(templateId: number, propertyIds: number[], appliedBy: number): Promise<BulkUpdateResult> {
    const template = await this.getGlobalTemplate(templateId);
    const result: BulkUpdateResult = {
      success: true,
      updated_properties: 0,
      updated_amenities: 0,
      warnings: [],
      errors: []
    };
    
    for (const propertyId of propertyIds) {
      try {
        // Check if amenity already exists
        const existingQuery = `
          SELECT id FROM amenities 
          WHERE property_id = ? AND name = ? AND category = ?
        `;
        
        const [existing] = await db.execute<RowDataPacket[]>(existingQuery, [
          propertyId, template.name, template.category
        ]);
        
        if (existing.length > 0) {
          // Update existing amenity
          const updateQuery = `
            UPDATE amenities 
            SET description = ?, icon = ?, template_id = ?, approved_by_admin = ?, is_admin_managed = true
            WHERE id = ?
          `;
          
          await db.execute(updateQuery, [
            template.description,
            template.icon,
            templateId,
            appliedBy,
            existing[0].id
          ]);
          
          result.warnings.push(`Property ${propertyId}: Updated existing amenity "${template.name}"`);
        } else {
          // Create new amenity from template
          const insertQuery = `
            INSERT INTO amenities (property_id, name, description, icon, category, template_id, created_by, approved_by_admin, is_admin_managed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, true)
          `;
          
          // 2026-10-03 12:45, optional template fields -> null (mysql2 rejects undefined bind values)
          await db.execute(insertQuery, [
            propertyId,
            template.name,
            template.description ?? null,
            template.icon ?? null,
            template.category ?? null,
            templateId,
            appliedBy,
            appliedBy
          ]);
        }
        
        result.updated_properties++;
        result.updated_amenities++;
        
      } catch (error) {
        result.errors.push(`Property ${propertyId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        result.success = false;
      }
    }
    
    // Log the bulk operation
    await this.logAdminAction('amenities', templateId, 'template_applied', {
      template_name: template.name,
      property_ids: propertyIds,
      result: result
    }, appliedBy);
    
    return result;
  }
  
  /**
   * Bulk update amenities with report impact checking
   */
  async bulkUpdateWithReportCheck(updates: BulkAmenityUpdate[], updatedBy: number): Promise<BulkUpdateResult> {
    const result: BulkUpdateResult = {
      success: true,
      updated_properties: 0,
      updated_amenities: 0,
      warnings: [],
      errors: []
    };
    
    for (const update of updates) {
      try {
        for (const amenityUpdate of update.amenity_updates) {
          if (amenityUpdate.id) {
            // Check for active reports before updating
            const reportsCount = await this.getActiveReportsCount(amenityUpdate.id);
            
            if (reportsCount > 0) {
              result.warnings.push(
                `Amenity "${amenityUpdate.name}" has ${reportsCount} active reports. Consider resolving them first.`
              );
            }
            
            // Update existing amenity
            const updateQuery = `
              UPDATE amenities 
              SET name = ?, description = ?, icon = ?, image_url = ?, category = ?, 
                  display_order = ?, approved_by_admin = ?, is_admin_managed = true
              WHERE id = ?
            `;
            
            // 2026-10-03 12:45, optional fields -> null (mysql2 rejects undefined bind values)
            await db.execute(updateQuery, [
              amenityUpdate.name,
              amenityUpdate.description ?? null,
              amenityUpdate.icon ?? null,
              amenityUpdate.image_url ?? null,
              amenityUpdate.category ?? null,
              amenityUpdate.display_order ?? 0,
              updatedBy,
              amenityUpdate.id ?? null
            ]);
            
            result.updated_amenities++;
          } else {
            // Create new amenity
            const insertQuery = `
              INSERT INTO amenities (property_id, name, description, icon, image_url, category, display_order, created_by, approved_by_admin, is_admin_managed)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true)
            `;
            
            // 2026-10-03 12:45, optional fields -> null (mysql2 rejects undefined bind values)
            await db.execute(insertQuery, [
              update.property_id,
              amenityUpdate.name,
              amenityUpdate.description ?? null,
              amenityUpdate.icon ?? null,
              amenityUpdate.image_url ?? null,
              amenityUpdate.category ?? null,
              amenityUpdate.display_order ?? 0,
              updatedBy,
              updatedBy
            ]);
            
            result.updated_amenities++;
          }
        }
        
        result.updated_properties++;
        
      } catch (error) {
        result.errors.push(`Property ${update.property_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        result.success = false;
      }
    }
    
    // Log the bulk operation
    await this.logAdminAction('amenities', 0, 'bulk_applied', {
      updates_count: updates.length,
      result: result
    }, updatedBy);
    
    return result;
  }
  
  /**
   * Delete amenity with report impact checking
   */
  async deleteAmenityWithReportCheck(amenityId: number, deletedBy: number): Promise<{ success: boolean; message: string }> {
    // Check for active reports
    const reportsCount = await this.getActiveReportsCount(amenityId);
    
    if (reportsCount > 0) {
      return {
        success: false,
        message: `Cannot delete amenity: ${reportsCount} active reports exist. Resolve reports first or auto-close them.`
      };
    }
    
    // Auto-close any resolved reports before deletion
    await this.reportService.autoCloseAmenityReports(
      amenityId, 
      deletedBy, 
      'Amenity removed by Super Admin'
    );
    
    // Delete the amenity
    const deleteQuery = 'DELETE FROM amenities WHERE id = ?';
    await db.execute(deleteQuery, [amenityId]);
    
    // Log the deletion
    await this.logAdminAction('amenities', amenityId, 'deleted', {
      reason: 'Super Admin deletion',
      reports_auto_closed: true
    }, deletedBy);
    
    return {
      success: true,
      message: 'Amenity deleted successfully. Associated reports have been auto-closed.'
    };
  }
  
  /**
   * Get active reports count for an amenity
   */
  private async getActiveReportsCount(amenityId: number): Promise<number> {
    const query = `
      SELECT COUNT(*) as count 
      FROM guest_reports 
      WHERE amenity_id = ? AND status IN ('new', 'acknowledged', 'in_progress')
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query, [amenityId]);
    return rows[0].count || 0;
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
}
