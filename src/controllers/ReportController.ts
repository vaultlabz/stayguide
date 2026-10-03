import { Request, Response } from 'express';
import { IntegratedReportService } from '../services/IntegratedReportService';
import { MockIntegratedReportService } from '../services/MockIntegratedReportService';
import { PropertyService } from '../services/PropertyService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: 'super_admin' | 'company_admin';
    company_id?: number;
  };
}

export class ReportController {
  private reportService: IntegratedReportService;
  private propertyService = new PropertyService();

  // 2026-10-03 11:34, company admins may only touch reports for their own company's properties
  private async canAccessProperty(user: NonNullable<AuthenticatedRequest['user']>, propertyId: number): Promise<boolean> {
    if (user.role === 'super_admin') return true;
    if (user.role !== 'company_admin' || !user.company_id) return false;
    const property = await this.propertyService.findById(propertyId);
    return !!property && property.company_id === user.company_id;
  }

  constructor() {
    // Use mock service if MOCK_DATABASE is enabled
    this.reportService = process.env.MOCK_DATABASE === 'true' 
      ? new MockIntegratedReportService()
      : new IntegratedReportService();
  }

  /**
   * Create a new guest report (Public endpoint - no authentication required)
   */
  async createGuestReport(req: Request, res: Response): Promise<void> {
    try {
      // 2026-10-03 11:39, property comes from the paired device (authenticateDevice), never the request body
      const property_id = (req as any).device?.property_id;
      const {
        amenity_id,
        guest_name,
        guest_room,
        guest_phone,
        category,
        title,
        description,
        priority = 'medium',
        location,
        urgency_level = 'not_urgent'
      } = req.body;

      // Validate required fields
      if (!property_id) {
        res.status(401).json({ error: 'Device token required' });
        return;
      }

      if (!category || !title || !description) {
        res.status(400).json({
          error: 'Missing required fields: category, title, description'
        });
        return;
      }

      // 2026-10-03 11:39, enum + amenity ownership validation
      if (!['low', 'medium', 'high', 'urgent'].includes(priority) ||
          !['not_urgent', 'same_day', 'immediate'].includes(urgency_level)) {
        res.status(400).json({ error: 'Invalid priority or urgency_level' });
        return;
      }

      if (amenity_id) {
        const amenity = await this.propertyService.findAmenityById(parseInt(amenity_id));
        if (!amenity || amenity.property_id !== property_id) {
          res.status(400).json({ error: 'Invalid amenity for this property' });
          return;
        }
      }

      // Validate category
      const validCategories = ['maintenance', 'supplies', 'housekeeping', 'amenities', 'wifi_tech', 'noise_complaint', 'other'];
      if (!validCategories.includes(category)) {
        res.status(400).json({
          error: 'Invalid category. Must be one of: ' + validCategories.join(', ')
        });
        return;
      }

      // Get guest IP for tracking
      const guest_ip = req.ip || req.connection.remoteAddress || 'unknown';

      const reportData = {
        property_id: parseInt(property_id),
        amenity_id: amenity_id ? parseInt(amenity_id) : null,
        guest_name,
        guest_room,
        guest_phone,
        category,
        title,
        description,
        priority,
        status: 'new' as const,
        location,
        urgency_level,
        guest_ip,
        admin_notified: false
      };

      const report = await this.reportService.createReport(reportData);

      res.status(201).json({
        success: true,
        message: 'Report submitted successfully',
        report: {
          id: report.id,
          title: report.title,
          category: report.category,
          priority: report.priority,
          status: report.status,
          created_at: report.created_at
        }
      });

    } catch (error) {
      console.error('Error creating guest report:', error);
      res.status(500).json({
        error: 'Failed to create report',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get reports for a specific property (Company Admin or Super Admin)
   */
  async getPropertyReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { propertyId } = req.params;
      const user = req.user!;

      // Permission check: Company Admin can only see their own property reports
      // 2026-10-03 11:34, enforce property ownership (was a TODO)
      if (!(await this.canAccessProperty(user, parseInt(propertyId)))) {
        res.status(403).json({ error: 'Access denied for this property' });
        return;
      }

      const reports = await this.reportService.getReportsByProperty(parseInt(propertyId));

      res.json({
        success: true,
        reports: reports,
        count: reports.length
      });

    } catch (error) {
      console.error('Error fetching property reports:', error);
      res.status(500).json({
        error: 'Failed to fetch reports',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all reports across all properties (Super Admin only)
   */
  async getAllReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can see all reports
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const reports = await this.reportService.getAllReports();

      res.json({
        success: true,
        reports: reports,
        count: reports.length
      });

    } catch (error) {
      console.error('Error fetching all reports:', error);
      res.status(500).json({
        error: 'Failed to fetch reports',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get reports that need admin attention (Super Admin only)
   */
  async getReportsNeedingAttention(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can see urgent reports
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const reports = await this.reportService.getReportsNeedingAdminAttention();

      res.json({
        success: true,
        reports: reports,
        count: reports.length
      });

    } catch (error) {
      console.error('Error fetching urgent reports:', error);
      res.status(500).json({
        error: 'Failed to fetch urgent reports',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update report status (Company Admin or Super Admin)
   */
  async updateReportStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { reportId } = req.params;
      const { status, resolution_notes } = req.body;
      const user = req.user!;

      // Validate status
      const validStatuses = ['new', 'acknowledged', 'in_progress', 'resolved', 'closed'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
        });
        return;
      }

      // Permission check: Company Admin can only update their own property reports
      // 2026-10-03 11:34, enforce property ownership via the report's property (was a TODO)
      let existingReport;
      try {
        existingReport = await this.reportService.getReportById(parseInt(reportId));
      } catch {
        res.status(404).json({ error: 'Report not found' });
        return;
      }
      if (!(await this.canAccessProperty(user, existingReport.property_id))) {
        res.status(403).json({ error: 'Access denied for this report' });
        return;
      }

      const updatedReport = await this.reportService.updateReportStatus(
        parseInt(reportId),
        status,
        user.id,
        resolution_notes
      );

      res.json({
        success: true,
        message: 'Report status updated successfully',
        report: updatedReport
      });

    } catch (error) {
      console.error('Error updating report status:', error);
      res.status(500).json({
        error: 'Failed to update report status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get reports for a specific amenity (Super Admin only)
   */
  async getAmenityReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { amenityId } = req.params;
      const user = req.user!;

      // Permission check: Only Super Admin can see amenity-specific reports
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const reports = await this.reportService.getReportsByAmenity(parseInt(amenityId));

      res.json({
        success: true,
        reports: reports,
        count: reports.length
      });

    } catch (error) {
      console.error('Error fetching amenity reports:', error);
      res.status(500).json({
        error: 'Failed to fetch amenity reports',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Auto-close reports for an amenity (Super Admin only)
   */
  async autoCloseAmenityReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { amenityId } = req.params;
      const { resolution_notes } = req.body;
      const user = req.user!;

      // Permission check: Only Super Admin can auto-close reports
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const affectedCount = await this.reportService.autoCloseAmenityReports(
        parseInt(amenityId),
        user.id,
        resolution_notes || 'Amenity issue resolved by Super Admin'
      );

      res.json({
        success: true,
        message: `Successfully auto-closed ${affectedCount} reports`,
        affected_reports: affectedCount
      });

    } catch (error) {
      console.error('Error auto-closing amenity reports:', error);
      res.status(500).json({
        error: 'Failed to auto-close reports',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get available amenities for a property (for report form dropdown)
   */
  async getPropertyAmenities(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId } = req.params;

      // Import PropertyService to get amenities
      const { PropertyService } = await import('../services/PropertyService');
      const { MockPropertyService } = await import('../services/MockPropertyService');
      
      const propertyService = process.env.MOCK_DATABASE === 'true' 
        ? new MockPropertyService()
        : new PropertyService();

      const amenities = await propertyService.getAmenitiesByProperty(parseInt(propertyId));

      res.json({
        success: true,
        amenities: amenities.map(amenity => ({
          id: amenity.id,
          name: amenity.name,
          category: amenity.category,
          icon: amenity.icon
        }))
      });

    } catch (error) {
      console.error('Error fetching property amenities:', error);
      res.status(500).json({
        error: 'Failed to fetch amenities',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}