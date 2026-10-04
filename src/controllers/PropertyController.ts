import { Request, Response } from 'express';
import { PropertyService } from '../services/PropertyService';
import { CompanyService } from '../services/CompanyService';
import { AuthRequest, Property } from '../types';
import { LinkService, isHttpUrl } from '../services/LinkService';
import QRCode from 'qrcode';
import path from 'path';
import { wifiQrPayload } from '../utils/wifi';
import { getWeather, geocodeAddress } from '../utils/weather';
import { getImageUrl, processAndSaveImage } from '../middleware/upload';

interface CompanyParams {
  companySlug: string;
}

interface PropertyParams extends CompanyParams {
  propertySlug: string;
}

// 2026-10-03 17:14, background presets live in one shared file (public/js/tablet-backgrounds.js, also used by the tablet and dashboard)
const TABLET_BACKGROUND_SLUGS: string[] = (require(path.join(__dirname, '../../public/js/tablet-backgrounds.js')).TABLET_BACKGROUNDS as Array<{ slug: string }>).map(b => b.slug);
const TABLET_BACKGROUND_VALUES = ['solid', 'image', ...TABLET_BACKGROUND_SLUGS];

export class PropertyController {
  private propertyService = new PropertyService();
  private companyService = new CompanyService();
  private linkService = new LinkService();

  async getPropertiesByCompany(req: AuthRequest, res: Response) {
    try {
      const { companySlug } = req.params;
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const properties = await this.propertyService.getPropertiesByCompany(company.id);
      
      console.log(`Retrieved ${properties.length} properties for ${company.name} by ${req.user?.email}`);
      res.json({
        message: 'Properties retrieved successfully',
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug
        },
        properties,
        total: properties.length
      });
    } catch (error) {
      console.error('Error getting properties:', error);
      res.status(500).json({ error: 'Failed to retrieve properties' });
    }
  }

  async getProperty(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug } = req.params;
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      console.log(`Property details retrieved: ${property.name} by ${req.user?.email}`);
      res.json({
        message: 'Property retrieved successfully',
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug
        },
        property
      });
    } catch (error) {
      console.error('Error getting property:', error);
      res.status(500).json({ error: 'Failed to retrieve property' });
    }
  }

  async createProperty(req: AuthRequest, res: Response) {
    try {
      const { companySlug } = req.params;
      const {
        name,
        slug,
        address,
        description,
        wifi_name,
        wifi_password,
        check_in_instructions,
        check_out_instructions,
        house_rules,
        emergency_contact
      } = req.body;

      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Validate required fields
      if (!name || !slug) {
        return res.status(400).json({ 
          error: 'Property name and slug are required' 
        });
      }

      // Check if property slug already exists for this company
      const existingProperty = await this.propertyService.findBySlug(company.id, slug);
      if (existingProperty) {
        return res.status(409).json({ error: 'Property slug already exists for this company' });
      }

      // 2026-10-03 12:32, validate optional link/image fields before creating anything
      const optional = this.normalizeOptionalFields(req.body);
      if (optional.error) {
        return res.status(400).json({ error: optional.error });
      }

      // Create property
      let property = await this.propertyService.createProperty({
        company_id: company.id,
        name,
        slug: slug.toLowerCase(),
        address,
        description,
        wifi_name,
        wifi_password,
        check_in_instructions,
        check_out_instructions,
        house_rules,
        emergency_contact
      });

      // 2026-10-03 12:32, createProperty's INSERT omits these (main_image_url was silently dropped on create)
      if (optional.fields && Object.keys(optional.fields).length > 0) {
        property = (await this.propertyService.updateProperty(property.id, optional.fields)) || property;
      }

      console.log(`Property created: ${property.name} for ${company.name} by ${req.user?.email}`);
      res.status(201).json({
        message: 'Property created successfully',
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug
        },
        property
      });
    } catch (error) {
      console.error('Error creating property:', error);
      res.status(500).json({ error: 'Failed to create property' });
    }
  }

  async updateProperty(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug } = req.params;
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const existingProperty = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!existingProperty) {
        return res.status(404).json({ error: 'Property not found' });
      }

      const updates = req.body;
      
      // Don't allow slug changes if it would conflict
      if (updates.slug && updates.slug !== existingProperty.slug) {
        const slugExists = await this.propertyService.findBySlug(company.id, updates.slug);
        if (slugExists) {
          return res.status(409).json({ error: 'Property slug already exists for this company' });
        }
        updates.slug = updates.slug.toLowerCase();
      }

      // 2026-10-03 12:32, validate/normalize link, offer and checkout-date fields
      const optional = this.normalizeOptionalFields(updates);
      if (optional.error) {
        return res.status(400).json({ error: optional.error });
      }
      Object.assign(updates, optional.fields);

      const updatedProperty = await this.propertyService.updateProperty(existingProperty.id, updates);

      console.log(`Property updated: ${updatedProperty?.name} by ${req.user?.email}`);
      res.json({
        message: 'Property updated successfully',
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug
        },
        property: updatedProperty
      });
    } catch (error) {
      console.error('Error updating property:', error);
      res.status(500).json({ error: 'Failed to update property' });
    }
  }

  async deleteProperty(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug } = req.params;
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      await this.propertyService.deleteProperty(property.id);

      console.log(`Property deleted: ${property.name} by ${req.user?.email}`);
      res.json({
        message: 'Property deactivated successfully',
        property_id: property.id
      });
    } catch (error) {
      console.error('Error deleting property:', error);
      res.status(500).json({ error: 'Failed to delete property' });
    }
  }

  // Public endpoint for tablet app
  // 2026-10-03 11:39, admin preview of tablet content (route now requires company-admin JWT)
  async getPropertyContent(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug } = req.params;

      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      await this.sendPropertyContent(req, res, company, property);
    } catch (error) {
      console.error('Error getting property content:', error);
      res.status(500).json({ error: 'Failed to retrieve property content' });
    }
  }

  // 2026-10-03 11:39, content for a paired tablet; property comes from the device token, never the URL
  async getDeviceContent(req: AuthRequest, res: Response) {
    try {
      const property = await this.propertyService.findById(req.device!.property_id);
      if (!property || property.status !== 'active') {
        return res.status(404).json({ error: 'Property not available' });
      }

      const company = await this.companyService.findById(property.company_id);
      if (!company || company.status !== 'active') {
        return res.status(404).json({ error: 'Property not available' });
      }

      await this.sendPropertyContent(req, res, company, property);
    } catch (error) {
      console.error('Error getting device content:', error);
      res.status(500).json({ error: 'Failed to retrieve property content' });
    }
  }

  // 2026-10-03 22:42, mode 'guest_link' = public phone guide: honors the Wi-Fi visibility toggle and never echoes the link token
  private async sendPropertyContent(req: Request, res: Response, company: { name: string; slug: string; logo_url?: string }, property: Property, mode: 'tablet' | 'guest_link' = 'tablet') {
    const propertyWithContent = await this.propertyService.getPropertyWithContent(property.id);
    const publicProperty: any = { ...(propertyWithContent?.property || property) };
    delete publicProperty.guest_link_token;
    const hideWifi = mode === 'guest_link' && (property.guest_link_show_wifi === false || property.guest_link_show_wifi === 0);
    if (hideWifi) publicProperty.wifi_password = null;

    // 2026-10-03 12:32, Phase 5: direct-booking / review QR codes for the tablet
    const baseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const guestLinks = await this.linkService.buildGuestLinks(property, baseUrl);

    const wifiPayload = hideWifi ? null : wifiQrPayload(property.wifi_name || '', property.wifi_password);

    console.log(`Property content retrieved for tablet: property ${property.id}`);
    res.json({
      message: 'Property content retrieved successfully',
      company: {
        name: company.name,
        slug: company.slug,
        logo_url: company.logo_url
      },
      ...propertyWithContent,
      property: publicProperty,
      access: mode,
      guest_links: guestLinks,
      // 2026-10-03 17:00, "Join Wi-Fi" QR for the Wi-Fi sheet (generated server-side like the guest-link QRs)
      wifi_qr_svg: wifiPayload ? await QRCode.toString(wifiPayload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null
    });
  }

  // 2026-10-03 22:42, G2 public guide link (req.guestLink set by resolveGuestLink middleware)
  async getGuestLinkContent(req: AuthRequest, res: Response) {
    try {
      const property = (req as any).guestLink.property as Property;
      const company = await this.companyService.findById(property.company_id);
      if (!company || company.status !== 'active') return res.status(404).json({ error: 'This guide is not available' });
      res.setHeader('Cache-Control', 'no-store');
      await this.sendPropertyContent(req, res, company, property, 'guest_link');
    } catch (error) {
      console.error('Error getting guest link content:', error);
      res.status(500).json({ error: 'Failed to retrieve guide' });
    }
  }

  async getGuestLinkWeather(req: AuthRequest, res: Response) {
    try {
      await this.sendWeather(res, (req as any).guestLink.property as Property);
    } catch (error) {
      console.error('Error getting guest link weather:', error);
      res.status(500).json({ error: 'Failed to retrieve weather' });
    }
  }

  // 2026-10-03 17:00, current weather for the tablet home screen (device token) and for the admin preview
  async getDeviceWeather(req: AuthRequest, res: Response) {
    try {
      const property = await this.propertyService.findById(req.device!.property_id);
      if (!property || property.status !== 'active') return res.status(404).json({ error: 'Property not available' });
      await this.sendWeather(res, property);
    } catch (error) {
      console.error('Error getting device weather:', error);
      res.status(500).json({ error: 'Failed to retrieve weather' });
    }
  }

  async getPropertyWeather(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug } = req.params;
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) return res.status(404).json({ error: 'Company not found' });
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) return res.status(403).json({ error: 'Access denied' });
      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) return res.status(404).json({ error: 'Property not found' });
      await this.sendWeather(res, property);
    } catch (error) {
      console.error('Error getting property weather:', error);
      res.status(500).json({ error: 'Failed to retrieve weather' });
    }
  }

  private async sendWeather(res: Response, property: Property) {
    const lat = property.latitude === null || property.latitude === undefined ? NaN : Number(property.latitude);
    const lon = property.longitude === null || property.longitude === undefined ? NaN : Number(property.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(404).json({ error: 'No location set for this property' });
    const weather = await getWeather(property.id, lat, lon, property.temperature_unit === 'C' ? 'C' : 'F');
    if (!weather) return res.status(503).json({ error: 'Weather unavailable' });
    res.json(weather);
  }

  // 2026-10-03 17:00, dashboard helper: find coordinates for an address (ZIP, then city) via Open-Meteo geocoding
  async geocode(req: AuthRequest, res: Response) {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 3 || query.length > 300) return res.status(400).json({ error: 'Enter an address, city or ZIP code first' });
    const hit = await geocodeAddress(query);
    if (!hit) return res.status(404).json({ error: 'Could not find that location. Enter coordinates manually.' });
    res.json(hit);
  }

  // 2026-10-03 12:32, QR scan counts for the dashboard (last 30 days)
  async getLinkStats(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug } = req.params;
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      const stats = await this.linkService.getStats(property.id, 30);
      res.json({ days: 30, stats });
    } catch (error) {
      console.error('Error getting link stats:', error);
      res.status(500).json({ error: 'Failed to retrieve link stats' });
    }
  }

  // 2026-10-03 12:32, validate/normalize optional fields that createProperty's INSERT doesn't cover
  private normalizeOptionalFields(body: any): { fields?: Record<string, any>; error?: string } {
    const fields: Record<string, any> = {};
    for (const key of ['direct_booking_url', 'review_url', 'main_image_url', 'background_image_url']) {
      if (body[key] === undefined) continue;
      const value = typeof body[key] === 'string' ? body[key].trim() : '';
      if (!value) { fields[key] = null; continue; }
      const isRelativeImage = (key === 'main_image_url' || key === 'background_image_url') && value.startsWith('/uploads/') && !value.includes('..');
      if (!isRelativeImage && !isHttpUrl(value)) {
        return { error: `${key} must be an http(s) URL` };
      }
      fields[key] = value;
    }
    // 2026-10-03 15:29, tablet theme is an enum (null/empty resets to auto)
    if (body.tablet_theme !== undefined) {
      const theme = body.tablet_theme || 'auto';
      if (!['auto', 'light', 'dark'].includes(theme)) return { error: 'tablet_theme must be auto, light or dark' };
      fields.tablet_theme = theme;
    }
    // 2026-10-03 16:42, tablet background style enum (null/empty resets to solid)
    if (body.tablet_background !== undefined) {
      const style = body.tablet_background || 'solid';
      if (!TABLET_BACKGROUND_VALUES.includes(style)) return { error: `tablet_background must be one of: ${TABLET_BACKGROUND_VALUES.join(', ')}` };
      fields.tablet_background = style;
    }
    // 2026-10-03 17:00, weather location (decimal ranges), temperature unit and clock format
    for (const [key, min, max] of [['latitude', -90, 90], ['longitude', -180, 180]] as const) {
      if (body[key] === undefined) continue;
      if (body[key] === null || body[key] === '') { fields[key] = null; continue; }
      const num = Number(body[key]);
      if (!Number.isFinite(num) || num < min || num > max) return { error: `${key} must be a number between ${min} and ${max}` };
      fields[key] = Math.round(num * 1e6) / 1e6;
    }
    if (body.temperature_unit !== undefined) {
      const unit = body.temperature_unit || 'F';
      if (!['F', 'C'].includes(unit)) return { error: 'temperature_unit must be F or C' };
      fields.temperature_unit = unit;
    }
    if (body.clock_format !== undefined) {
      const format = body.clock_format || '12h';
      if (!['12h', '24h'].includes(format)) return { error: 'clock_format must be 12h or 24h' };
      fields.clock_format = format;
    }
    if (body.return_guest_offer !== undefined) {
      const offer = typeof body.return_guest_offer === 'string' ? body.return_guest_offer.trim() : '';
      if (offer.length > 255) return { error: 'return_guest_offer must be 255 characters or fewer' };
      fields.return_guest_offer = offer || null;
    }
    // 2026-10-03 22:42, G2: show Wi-Fi password on the public guide link (boolean)
    if (body.guest_link_show_wifi !== undefined) {
      const v = body.guest_link_show_wifi;
      if (typeof v !== 'boolean') return { error: 'guest_link_show_wifi must be true or false' };
      fields.guest_link_show_wifi = v;
    }
    if (body.guest_checkout_date !== undefined) {
      const date = typeof body.guest_checkout_date === 'string' ? body.guest_checkout_date.trim() : '';
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'guest_checkout_date must be YYYY-MM-DD' };
      fields.guest_checkout_date = date || null;
    }
    return { fields };
  }

  // Amenities endpoints
  async getAmenitiesByProperty(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug } = req.params;
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      const amenities = await this.propertyService.getAmenitiesByProperty(property.id);
      
      res.json({
        message: 'Amenities retrieved successfully',
        property: {
          id: property.id,
          name: property.name,
          slug: property.slug
        },
        amenities
      });
    } catch (error) {
      console.error('Error getting amenities:', error);
      res.status(500).json({ error: 'Failed to retrieve amenities' });
    }
  }

  async createAmenity(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug } = req.params;
      const { name, description, icon, image_url, category, display_order } = req.body;
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      const amenityData = {
        property_id: property.id,
        name,
        description,
        icon,
        image_url,
        category,
        display_order
      };

      const amenity = await this.propertyService.createAmenity(amenityData);
      
      console.log(`Amenity created: ${amenity.name} for property ${property.name} by ${req.user?.email}`);
      res.json({
        message: 'Amenity created successfully',
        amenity
      });
    } catch (error) {
      console.error('Error creating amenity:', error);
      res.status(500).json({ error: 'Failed to create amenity' });
    }
  }

  async updateAmenity(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug, amenityId } = req.params;
      const updates = req.body;
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // 2026-10-03 11:34, amenity must belong to this property (blocks cross-tenant edits by id)
      const existingAmenity = await this.propertyService.findAmenityById(parseInt(amenityId));
      if (!existingAmenity || existingAmenity.property_id !== property.id) {
        return res.status(404).json({ error: 'Amenity not found' });
      }

      const amenity = await this.propertyService.updateAmenity(existingAmenity.id, updates);
      if (!amenity) {
        return res.status(404).json({ error: 'Amenity not found' });
      }
      
      console.log(`Amenity updated: ${amenity.name} by ${req.user?.email}`);
      res.json({
        message: 'Amenity updated successfully',
        amenity
      });
    } catch (error) {
      console.error('Error updating amenity:', error);
      res.status(500).json({ error: 'Failed to update amenity' });
    }
  }

  async deleteAmenity(req: AuthRequest, res: Response) {
    try {
      const { companySlug, propertySlug, amenityId } = req.params;
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const property = await this.propertyService.findBySlug(company.id, propertySlug);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // 2026-10-03 11:34, amenity must belong to this property (blocks cross-tenant deletes by id)
      const existingAmenity = await this.propertyService.findAmenityById(parseInt(amenityId));
      if (!existingAmenity || existingAmenity.property_id !== property.id) {
        return res.status(404).json({ error: 'Amenity not found' });
      }

      const deleted = await this.propertyService.deleteAmenity(existingAmenity.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Amenity not found' });
      }
      
      console.log(`Amenity deleted: ${amenityId} by ${req.user?.email}`);
      res.json({
        message: 'Amenity deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting amenity:', error);
      res.status(500).json({ error: 'Failed to delete amenity' });
    }
  }

  // Image upload endpoints
  async uploadPropertyImage(req: AuthRequest, res: Response) {
    try {
      const { companySlug } = req.params;
      
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Process and save image with Sharp
      const processedImage = await processAndSaveImage(req.file.buffer, 'property', req.file.originalname);
      const imageUrl = getImageUrl(processedImage.filename, 'property');
      
      console.log(`Property image processed and uploaded: ${processedImage.filename} by ${req.user?.email}`);
      res.json({
        message: 'Image uploaded and processed successfully',
        imageUrl,
        filename: processedImage.filename,
        originalName: req.file.originalname,
        originalSize: processedImage.originalSize,
        processedSizes: processedImage.processedSizes,
        availableSizes: {
          large: getImageUrl(processedImage.sizes.large, 'property'),
          medium: getImageUrl(processedImage.sizes.medium, 'property'),
          small: getImageUrl(processedImage.sizes.small, 'property')
        },
        processedFormat: 'jpeg'
      });
    } catch (error) {
      console.error('Error uploading property image:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  }

  async uploadAmenityImage(req: AuthRequest, res: Response) {
    try {
      const { companySlug } = req.params;
      
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }
      
      // Get company by slug
      const company = await this.companyService.findBySlug(companySlug);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Check permissions
      if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Process and save image with Sharp
      const processedImage = await processAndSaveImage(req.file.buffer, 'amenity', req.file.originalname);
      const imageUrl = getImageUrl(processedImage.filename, 'amenity');
      
      console.log(`Amenity image processed and uploaded: ${processedImage.filename} by ${req.user?.email}`);
      res.json({
        message: 'Image uploaded and processed successfully',
        imageUrl,
        filename: processedImage.filename,
        originalName: req.file.originalname,
        originalSize: processedImage.originalSize,
        processedSizes: processedImage.processedSizes,
        availableSizes: {
          large: getImageUrl(processedImage.sizes.large, 'amenity'),
          medium: getImageUrl(processedImage.sizes.medium, 'amenity'),
          small: getImageUrl(processedImage.sizes.small, 'amenity')
        },
        processedFormat: 'jpeg'
      });
    } catch (error) {
      console.error('Error uploading amenity image:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  }
}