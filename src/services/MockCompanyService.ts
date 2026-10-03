import { Company } from '../types';
import { mockCompanies, mockDelay, MOCK_MODE } from '../utils/mock-database';

export class MockCompanyService {
  async findById(id: number): Promise<Company | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const company = mockCompanies.find(c => c.id === id);
    
    if (company) {
      console.log(`[MOCK] Company found: ${company.name}`);
      return company as unknown as Company;
    }
    
    return null;
  }

  async findBySlug(slug: string): Promise<Company | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const company = mockCompanies.find(c => c.slug === slug && c.status === 'active');
    
    if (company) {
      console.log(`[MOCK] Company found by slug: ${company.name}`);
      return company as unknown as Company;
    }
    
    return null;
  }

  async getAllCompanies(): Promise<Company[]> {
    if (!MOCK_MODE) return [];
    
    await mockDelay();
    console.log(`[MOCK] Retrieved ${mockCompanies.length} companies`);
    return mockCompanies as unknown as Company[];
  }

  async createCompany(companyData: any): Promise<Company> {
    if (!MOCK_MODE) throw new Error('Mock mode not enabled');
    
    await mockDelay();
    
    const newCompany = {
      id: Math.max(...mockCompanies.map(c => c.id)) + 1,
      ...companyData,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    } as Company;
    
    mockCompanies.push(newCompany as any);
    console.log(`[MOCK] Company created: ${newCompany.name}`);
    return newCompany;
  }

  async updateCompany(id: number, updates: Partial<Company>): Promise<Company | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const companyIndex = mockCompanies.findIndex(c => c.id === id);
    
    if (companyIndex === -1) return null;
    
    mockCompanies[companyIndex] = { ...mockCompanies[companyIndex], ...updates, updated_at: new Date() } as any;
    console.log(`[MOCK] Company updated: ${mockCompanies[companyIndex].name}`);
    return mockCompanies[companyIndex] as unknown as Company;
  }

  async deleteCompany(id: number): Promise<boolean> {
    if (!MOCK_MODE) return false;
    
    await mockDelay();
    const companyIndex = mockCompanies.findIndex(c => c.id === id);
    
    if (companyIndex === -1) return false;
    
    mockCompanies[companyIndex].status = 'inactive';
    mockCompanies[companyIndex].updated_at = new Date();
    
    console.log(`[MOCK] Company marked as inactive: ${id}`);
    return true;
  }
}