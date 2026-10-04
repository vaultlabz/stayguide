import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { Property } from '../types';
import { MockPropertyService } from './MockPropertyService';
import { MOCK_MODE } from '../utils/mock-database';
import {
  pickAllowedFields, buildSetClause,
  PROPERTY_UPDATE_FIELDS, AMENITY_UPDATE_FIELDS, AMENITY_ADMIN_FIELDS
} from '../utils/sql';

export class PropertyService {
  private mockService = new MockPropertyService();

  async findById(id: number): Promise<Property | null> {
    if (MOCK_MODE) {
      return this.mockService.findById(id);
    }
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM properties WHERE id = ?',
        [id]
      );

      if (rows.length === 0) {
        return null;
      }

      const property = rows[0] as Property;
      console.log(`Property found: ${property.name}`);
      return property;
    } catch (error) {
      console.error('Error finding property by ID:', error);
      throw new Error('Database error');
    }
  }

  // 2026-10-03 22:42, G2 public guide link: look up by token; token is only ever set via setGuestLinkToken
  async findByGuestLinkToken(token: string): Promise<Property | null> {
    if (MOCK_MODE) {
      return this.mockService.findByGuestLinkToken(token);
    }
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM properties WHERE guest_link_token = ?', [token]);
    return (rows[0] as Property) || null;
  }

  async setGuestLinkToken(id: number, token: string): Promise<void> {
    if (MOCK_MODE) {
      return this.mockService.setGuestLinkToken(id, token);
    }
    await db.execute('UPDATE properties SET guest_link_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [token, id]);
  }

  async findBySlug(companyId: number, slug: string): Promise<Property | null> {
    if (MOCK_MODE) {
      return this.mockService.findBySlug(companyId, slug);
    }
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM properties WHERE company_id = ? AND slug = ? AND status = "active"',
        [companyId, slug]
      );

      if (rows.length === 0) {
        return null;
      }

      const property = rows[0] as Property;
      console.log(`Property found by slug: ${property.name}`);
      return property;
    } catch (error) {
      console.error('Error finding property by slug:', error);
      throw new Error('Database error');
    }
  }

  async getPropertiesByCompany(companyId: number): Promise<Property[]> {
    if (MOCK_MODE) {
      return this.mockService.getPropertiesByCompany(companyId);
    }
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM properties WHERE company_id = ? ORDER BY created_at DESC',
        [companyId]
      );

      const properties = rows as Property[];
      console.log(`Retrieved ${properties.length} properties for company ${companyId}`);
      return properties;
    } catch (error) {
      console.error('Error getting properties by company:', error);
      throw new Error('Database error');
    }
  }

  async createProperty(propertyData: {
    company_id: number;
    name: string;
    slug: string;
    address?: string;
    description?: string;
    wifi_name?: string;
    wifi_password?: string;
    check_in_instructions?: string;
    check_out_instructions?: string;
    house_rules?: string;
    emergency_contact?: string;
  }): Promise<Property> {
    if (MOCK_MODE) {
      return this.mockService.createProperty(propertyData);
    }
    
    try {
      const [result] = await db.execute(
        `INSERT INTO properties (company_id, name, slug, address, description, wifi_name, wifi_password, 
         check_in_instructions, check_out_instructions, house_rules, emergency_contact, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          propertyData.company_id,
          propertyData.name,
          propertyData.slug,
          propertyData.address || null,
          propertyData.description || null,
          propertyData.wifi_name || null,
          propertyData.wifi_password || null,
          propertyData.check_in_instructions || null,
          propertyData.check_out_instructions || null,
          propertyData.house_rules || null,
          propertyData.emergency_contact || null
        ]
      );

      const insertResult = result as any;
      const newProperty = await this.findById(insertResult.insertId);
      
      if (!newProperty) {
        throw new Error('Failed to create property');
      }

      console.log(`Property created: ${newProperty.name}`);
      return newProperty;
    } catch (error) {
      console.error('Error creating property:', error);
      throw new Error('Failed to create property');
    }
  }

  async updateProperty(id: number, updates: Partial<Property>): Promise<Property | null> {
    // 2026-10-03 11:34, whitelist columns (blocks SQL injection and company_id reassignment)
    const fields = pickAllowedFields(updates, PROPERTY_UPDATE_FIELDS);

    if (MOCK_MODE) {
      return this.mockService.updateProperty(id, fields);
    }

    try {
      if (Object.keys(fields).length === 0) {
        return this.findById(id);
      }

      const { setClause, values } = buildSetClause(fields);

      await db.execute(
        `UPDATE properties SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id]
      );

      const updatedProperty = await this.findById(id);
      console.log(`Property updated: ${updatedProperty?.name}`);
      return updatedProperty;
    } catch (error) {
      console.error('Error updating property:', error);
      throw new Error('Failed to update property');
    }
  }

  async deleteProperty(id: number): Promise<boolean> {
    if (MOCK_MODE) {
      return this.mockService.deleteProperty(id);
    }
    
    try {
      await db.execute(
        'UPDATE properties SET status = "inactive", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      console.log(`Property marked as inactive: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting property:', error);
      throw new Error('Failed to delete property');
    }
  }

  async getPropertyWithContent(id: number): Promise<any> {
    if (MOCK_MODE) {
      return this.mockService.getPropertyWithContent(id);
    }
    
    try {
      // Get property details
      const property = await this.findById(id);
      if (!property) {
        return null;
      }

      // Get property content
      const [contentRows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM property_content WHERE property_id = ?',
        [id]
      );

      // Get restaurants
      const [restaurantRows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM restaurants WHERE property_id = ? AND status = "active" ORDER BY display_order, name',
        [id]
      );

      // Get how-to videos
      const [videoRows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM howto_videos WHERE property_id = ? AND status = "active" ORDER BY display_order, title',
        [id]
      );

      // Get local info
      const [infoRows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM local_info WHERE property_id = ? AND status = "active" ORDER BY category, display_order, title',
        [id]
      );

      // Get active announcements
      const [announcementRows] = await db.execute<RowDataPacket[]>(
        `SELECT * FROM announcements WHERE property_id = ? AND status = "active" 
         AND (scheduled_start IS NULL OR scheduled_start <= NOW()) 
         AND (scheduled_end IS NULL OR scheduled_end >= NOW()) 
         ORDER BY created_at DESC`,
        [id]
      );

      // 2026-10-03 11:39, include amenities (mock already did) and never return null content (tablet reads content.*)
      const amenities = await this.getAmenitiesByProperty(id);

      const result = {
        property,
        content: contentRows[0] || {},
        restaurants: restaurantRows,
        videos: videoRows,
        local_info: infoRows,
        announcements: announcementRows,
        amenities
      };

      console.log(`Property with content retrieved: ${property.name}`);
      return result;
    } catch (error) {
      console.error('Error getting property with content:', error);
      throw new Error('Failed to retrieve property content');
    }
  }

  // Amenities CRUD operations
  // 2026-10-03 11:34, single-amenity lookup used for ownership checks
  async findAmenityById(id: number): Promise<any | null> {
    if (MOCK_MODE) {
      return this.mockService.findAmenityById(id);
    }

    try {
      const [rows] = await db.execute('SELECT * FROM amenities WHERE id = ?', [id]);
      return (rows as any[])[0] || null;
    } catch (error) {
      console.error('Error finding amenity:', error);
      throw new Error('Failed to find amenity');
    }
  }

  async getAmenitiesByProperty(propertyId: number): Promise<any[]> {
    if (MOCK_MODE) {
      return this.mockService.getAmenitiesByProperty(propertyId);
    }
    
    try {
      const [rows] = await db.execute(
        'SELECT * FROM amenities WHERE property_id = ? AND status = ? ORDER BY display_order ASC',
        [propertyId, 'active']
      );
      
      return rows as any[];
    } catch (error) {
      console.error('Error getting amenities:', error);
      throw new Error('Failed to get amenities');
    }
  }

  async createAmenity(amenityData: any): Promise<any> {
    if (MOCK_MODE) {
      return this.mockService.createAmenity(amenityData);
    }
    
    try {
      const [result] = await db.execute(
        'INSERT INTO amenities (property_id, name, description, icon, image_url, category, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          amenityData.property_id,
          amenityData.name,
          amenityData.description || null,
          amenityData.icon || null,
          amenityData.image_url || null,
          amenityData.category || 'general',
          amenityData.display_order || 0
        ]
      );

      const insertResult = result as any;
      const newAmenity = await db.execute(
        'SELECT * FROM amenities WHERE id = ?',
        [insertResult.insertId]
      );
      
      return (newAmenity[0] as any[])[0];
    } catch (error) {
      console.error('Error creating amenity:', error);
      throw new Error('Failed to create amenity');
    }
  }

  async updateAmenity(id: number, updates: any, allowAdminFields = false): Promise<any | null> {
    // 2026-10-03 11:34, whitelist columns; admin-managed flags only from Super Admin callers
    const allowed = allowAdminFields
      ? [...AMENITY_UPDATE_FIELDS, ...AMENITY_ADMIN_FIELDS]
      : AMENITY_UPDATE_FIELDS;
    const fields = pickAllowedFields(updates, allowed);

    if (MOCK_MODE) {
      return this.mockService.updateAmenity(id, fields);
    }

    try {
      if (Object.keys(fields).length === 0) {
        return this.findAmenityById(id);
      }

      const { setClause, values } = buildSetClause(fields);

      await db.execute(
        `UPDATE amenities SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id]
      );

      const [rows] = await db.execute('SELECT * FROM amenities WHERE id = ?', [id]);
      return (rows as any[])[0] || null;
    } catch (error) {
      console.error('Error updating amenity:', error);
      throw new Error('Failed to update amenity');
    }
  }

  async deleteAmenity(id: number): Promise<boolean> {
    if (MOCK_MODE) {
      return this.mockService.deleteAmenity(id);
    }
    
    try {
      await db.execute(
        'UPDATE amenities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['inactive', id]
      );
      
      return true;
    } catch (error) {
      console.error('Error deleting amenity:', error);
      throw new Error('Failed to delete amenity');
    }
  }
}