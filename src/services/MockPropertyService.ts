import { Property } from '../types';
import { mockProperties, mockRestaurants, mockAnnouncements, mockAmenities, mockDelay, MOCK_MODE } from '../utils/mock-database';

export class MockPropertyService {
  async findById(id: number): Promise<Property | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const property = mockProperties.find(p => p.id === id);
    
    if (property) {
      console.log(`[MOCK] Property found: ${property.name}`);
      return property as unknown as Property;
    }
    
    return null;
  }

  async findBySlug(companyId: number, slug: string): Promise<Property | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const property = mockProperties.find(p => 
      p.company_id === companyId && 
      p.slug === slug && 
      p.status === 'active'
    );
    
    if (property) {
      console.log(`[MOCK] Property found by slug: ${property.name}`);
      return property as unknown as Property;
    }
    
    return null;
  }

  async getPropertiesByCompany(companyId: number): Promise<Property[]> {
    if (!MOCK_MODE) return [];
    
    await mockDelay();
    const properties = mockProperties.filter(p => p.company_id === companyId);
    
    console.log(`[MOCK] Retrieved ${properties.length} properties for company ${companyId}`);
    return properties as unknown as Property[];
  }

  async createProperty(propertyData: any): Promise<Property> {
    if (!MOCK_MODE) throw new Error('Mock mode not enabled');
    
    await mockDelay();
    
    const newProperty = {
      id: Math.max(...mockProperties.map(p => p.id)) + 1,
      ...propertyData,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    } as Property;
    
    mockProperties.push(newProperty as any);
    console.log(`[MOCK] Property created: ${newProperty.name}`);
    return newProperty;
  }

  async updateProperty(id: number, updates: Partial<Property>): Promise<Property | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const propertyIndex = mockProperties.findIndex(p => p.id === id);
    
    if (propertyIndex === -1) return null;
    
    mockProperties[propertyIndex] = { ...mockProperties[propertyIndex], ...updates, updated_at: new Date() } as any;
    console.log(`[MOCK] Property updated: ${mockProperties[propertyIndex].name}`);
    return mockProperties[propertyIndex] as unknown as Property;
  }

  async deleteProperty(id: number): Promise<boolean> {
    if (!MOCK_MODE) return false;
    
    await mockDelay();
    const propertyIndex = mockProperties.findIndex(p => p.id === id);
    
    if (propertyIndex === -1) return false;
    
    mockProperties[propertyIndex].status = 'inactive';
    mockProperties[propertyIndex].updated_at = new Date();
    
    console.log(`[MOCK] Property marked as inactive: ${id}`);
    return true;
  }

  async getPropertyWithContent(id: number): Promise<any> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const property = mockProperties.find(p => p.id === id);
    
    if (!property) return null;
    
    const restaurants = mockRestaurants.filter(r => r.property_id === id);
    const announcements = mockAnnouncements.filter(a => a.property_id === id);
    const amenities = mockAmenities.filter(a => a.property_id === id);
    
    const result = {
      property,
      content: {
        welcome_message: 'Welcome to our beautiful property! We hope you have a wonderful stay.',
        weather_widget: true
      },
      restaurants,
      amenities,
      videos: [
        {
          id: 1,
          title: 'How to use the smart lock',
          video_url: 'https://youtube.com/watch?v=demo1',
          description: 'Quick tutorial on using the electronic door lock system.'
        }
      ],
      local_info: [
        {
          id: 1,
          category: 'attractions',
          title: 'Beach City Pier',
          description: 'Historic pier with fishing, shops, and restaurants.',
          phone: '(555) 987-6543'
        }
      ],
      announcements
    };
    
    console.log(`[MOCK] Property with content retrieved: ${property.name}`);
    return result;
  }

  // Amenities CRUD operations
  async getAmenitiesByProperty(propertyId: number): Promise<any[]> {
    if (!MOCK_MODE) return [];
    
    await mockDelay();
    const amenities = mockAmenities.filter(a => a.property_id === propertyId);
    
    console.log(`[MOCK] Retrieved ${amenities.length} amenities for property ${propertyId}`);
    return amenities;
  }

  async createAmenity(amenityData: any): Promise<any> {
    if (!MOCK_MODE) throw new Error('Mock mode not enabled');
    
    await mockDelay();
    
    const newAmenity = {
      id: Math.max(...mockAmenities.map(a => a.id)) + 1,
      ...amenityData,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    };
    
    mockAmenities.push(newAmenity);
    console.log(`[MOCK] Amenity created: ${newAmenity.name}`);
    return newAmenity;
  }

  // 2026-10-03 11:34, single-amenity lookup used for ownership checks
  async findAmenityById(id: number): Promise<any | null> {
    if (!MOCK_MODE) return null;

    await mockDelay();
    return mockAmenities.find(a => a.id === id) || null;
  }

  async updateAmenity(id: number, updates: any): Promise<any | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const amenityIndex = mockAmenities.findIndex(a => a.id === id);
    
    if (amenityIndex === -1) return null;
    
    mockAmenities[amenityIndex] = { ...mockAmenities[amenityIndex], ...updates, updated_at: new Date() };
    console.log(`[MOCK] Amenity updated: ${mockAmenities[amenityIndex].name}`);
    return mockAmenities[amenityIndex];
  }

  async deleteAmenity(id: number): Promise<boolean> {
    if (!MOCK_MODE) return false;
    
    await mockDelay();
    const amenityIndex = mockAmenities.findIndex(a => a.id === id);
    
    if (amenityIndex === -1) return false;
    
    mockAmenities[amenityIndex].status = 'inactive';
    mockAmenities[amenityIndex].updated_at = new Date();
    
    console.log(`[MOCK] Amenity marked as inactive: ${id}`);
    return true;
  }
}