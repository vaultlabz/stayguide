import { Request, Response } from 'express';
import { IntegratedAdminAmenityService } from '../services/IntegratedAdminAmenityService';
import { PropertyService } from '../services/PropertyService';
import { MockPropertyService } from '../services/MockPropertyService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: 'super_admin' | 'company_admin';
    company_id?: number;
  };
}

export class AdminAmenityController {
  private adminAmenityService: IntegratedAdminAmenityService;
  private propertyService: PropertyService | MockPropertyService;

  constructor() {
    this.adminAmenityService = new IntegratedAdminAmenityService();
    this.propertyService = process.env.MOCK_DATABASE === 'true' 
      ? new MockPropertyService()
      : new PropertyService();
  }

  /**
   * Get all amenities across all properties (Super Admin only)
   */
  async getAllAmenities(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can see all amenities
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const amenities = await this.adminAmenityService.getAllAmenitiesWithReports();

      res.json({
        success: true,
        amenities: amenities,
        count: amenities.length
      });

    } catch (error) {
      console.error('Error fetching all amenities:', error);
      res.status(500).json({
        error: 'Failed to fetch amenities',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get amenity with reports information (Super Admin only)
   */
  async getAmenityWithReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { amenityId } = req.params;
      const user = req.user!;

      // Permission check: Only Super Admin can see amenity reports
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const amenityWithReports = await this.adminAmenityService.getAmenityWithReports(parseInt(amenityId));

      res.json({
        success: true,
        amenity: amenityWithReports
      });

    } catch (error) {
      console.error('Error fetching amenity with reports:', error);
      res.status(500).json({
        error: 'Failed to fetch amenity details',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create global amenity template (Super Admin only)
   */
  async createGlobalTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can create templates
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const { name, description, icon, category, is_standard } = req.body;

      // Validate required fields
      if (!name || !category) {
        res.status(400).json({
          error: 'Missing required fields: name, category'
        });
        return;
      }

      // Validate category
      const validCategories = ['recreation', 'comfort', 'kitchen', 'location', 'technology', 'safety', 'general'];
      if (!validCategories.includes(category)) {
        res.status(400).json({
          error: 'Invalid category. Must be one of: ' + validCategories.join(', ')
        });
        return;
      }

      const templateData = {
        name,
        description,
        icon,
        category,
        is_standard: is_standard || false,
        created_by: user.id
      };

      const template = await this.adminAmenityService.createGlobalTemplate(templateData);

      res.status(201).json({
        success: true,
        message: 'Global template created successfully',
        template: template
      });

    } catch (error) {
      console.error('Error creating global template:', error);
      res.status(500).json({
        error: 'Failed to create template',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all global amenity templates
   */
  async getGlobalTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can see templates
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const templates = await this.adminAmenityService.getGlobalTemplates();

      res.json({
        success: true,
        templates: templates,
        count: templates.length
      });

    } catch (error) {
      console.error('Error fetching global templates:', error);
      res.status(500).json({
        error: 'Failed to fetch templates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Apply template to multiple properties (Super Admin only)
   */
  async applyTemplateToProperties(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can apply templates
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const { templateId } = req.params;
      const { property_ids } = req.body;

      // Validate required fields
      if (!property_ids || !Array.isArray(property_ids) || property_ids.length === 0) {
        res.status(400).json({
          error: 'Missing or invalid property_ids array'
        });
        return;
      }

      const result = await this.adminAmenityService.applyTemplateWithReportHandling(
        parseInt(templateId),
        property_ids.map((id: any) => parseInt(id)),
        user.id
      );

      res.json({
        success: result.success,
        message: result.success ? 'Template applied successfully' : 'Template application completed with issues',
        result: result
      });

    } catch (error) {
      console.error('Error applying template:', error);
      res.status(500).json({
        error: 'Failed to apply template',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Bulk update amenities (Super Admin only)
   */
  async bulkUpdateAmenities(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can bulk update
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const { updates } = req.body;

      // Validate required fields
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({
          error: 'Missing or invalid updates array'
        });
        return;
      }

      const result = await this.adminAmenityService.bulkUpdateWithReportCheck(updates, user.id);

      res.json({
        success: result.success,
        message: result.success ? 'Bulk update completed successfully' : 'Bulk update completed with issues',
        result: result
      });

    } catch (error) {
      console.error('Error bulk updating amenities:', error);
      res.status(500).json({
        error: 'Failed to bulk update amenities',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update single amenity (Super Admin override)
   */
  async updateAmenity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { amenityId } = req.params;
      const user = req.user!;

      // Permission check: Super Admin can update any amenity
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const updates = req.body;

      // Use the existing PropertyService update method but with Super Admin override
      // 2026-10-03 11:34, Super Admin path may set admin-managed flags (allowAdminFields = true)
      const updatedAmenity = await this.propertyService.updateAmenity(parseInt(amenityId), {
        ...updates,
        approved_by_admin: user.id,
        is_admin_managed: true
      }, true);

      res.json({
        success: true,
        message: 'Amenity updated successfully',
        amenity: updatedAmenity
      });

    } catch (error) {
      console.error('Error updating amenity:', error);
      res.status(500).json({
        error: 'Failed to update amenity',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete amenity with report checking (Super Admin only)
   */
  async deleteAmenity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { amenityId } = req.params;
      const user = req.user!;

      // Permission check: Only Super Admin can delete amenities
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      const result = await this.adminAmenityService.deleteAmenityWithReportCheck(
        parseInt(amenityId),
        user.id
      );

      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }

    } catch (error) {
      console.error('Error deleting amenity:', error);
      res.status(500).json({
        error: 'Failed to delete amenity',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all properties for template application (Super Admin only)
   */
  async getAllProperties(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can see all properties
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      // Get all properties across all companies
      const { mockProperties, mockCompanies } = await import('../utils/mock-database');
      
      if (process.env.MOCK_DATABASE === 'true') {
        const propertiesWithCompany = mockProperties.map(property => {
          const company = mockCompanies.find(c => c.id === property.company_id);
          return {
            id: property.id,
            name: property.name,
            slug: property.slug,
            company_name: company?.name || 'Unknown Company',
            company_id: property.company_id,
            status: property.status
          };
        });

        res.json({
          success: true,
          properties: propertiesWithCompany,
          count: propertiesWithCompany.length
        });
      } else {
        // TODO: Implement real database query for all properties
        res.status(501).json({
          error: 'Real database implementation pending'
        });
      }

    } catch (error) {
      console.error('Error fetching all properties:', error);
      res.status(500).json({
        error: 'Failed to fetch properties',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get amenity analytics (Super Admin only)
   */
  async getAmenityAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user!;

      // Permission check: Only Super Admin can see analytics
      if (user.role !== 'super_admin') {
        res.status(403).json({
          error: 'Access denied. Super Admin role required.'
        });
        return;
      }

      // Get amenity usage statistics
      const amenities = await this.adminAmenityService.getAllAmenitiesWithReports();

      const analytics = {
        total_amenities: amenities.length,
        amenities_with_reports: amenities.filter(a => a.active_reports_count > 0).length,
        urgent_issues: amenities.filter(a => a.urgent_reports_count > 0).length,
        category_breakdown: amenities.reduce((acc, amenity) => {
          acc[amenity.category] = (acc[amenity.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        report_summary: {
          total_active_reports: amenities.reduce((sum, a) => sum + a.active_reports_count, 0),
          total_urgent_reports: amenities.reduce((sum, a) => sum + a.urgent_reports_count, 0)
        },
        top_reported_amenities: amenities
          .filter(a => a.active_reports_count > 0)
          .sort((a, b) => b.active_reports_count - a.active_reports_count)
          .slice(0, 10)
          .map(a => ({
            id: a.id,
            name: a.name,
            category: a.category,
            active_reports: a.active_reports_count,
            urgent_reports: a.urgent_reports_count
          }))
      };

      res.json({
        success: true,
        analytics: analytics
      });

    } catch (error) {
      console.error('Error fetching amenity analytics:', error);
      res.status(500).json({
        error: 'Failed to fetch analytics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
