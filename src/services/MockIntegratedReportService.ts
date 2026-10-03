import { GuestReport, GuestReportWithAmenity, IntegratedReportService } from './IntegratedReportService';

// Mock data for guest reports
let mockGuestReports: GuestReportWithAmenity[] = [
  {
    id: 1,
    property_id: 1,
    amenity_id: 1, // Private Pool
    guest_name: 'John Smith',
    guest_room: '101',
    guest_phone: '+1-555-0123',
    category: 'amenities',
    title: 'Pool heater not working',
    description: 'The pool water is quite cold. The heater seems to not be functioning properly.',
    priority: 'medium',
    status: 'new',
    location: 'Pool Area',
    urgency_level: 'same_day',
    guest_ip: '192.168.1.100',
    admin_notified: false,
    amenity_name: 'Private Pool',
    amenity_category: 'recreation',
    created_at: new Date('2025-10-04T10:30:00Z'),
    updated_at: new Date('2025-10-04T10:30:00Z')
  },
  {
    id: 2,
    property_id: 1,
    amenity_id: 3, // Gourmet Kitchen
    guest_name: 'Sarah Johnson',
    guest_room: '102',
    guest_phone: '+1-555-0456',
    category: 'maintenance',
    title: 'Dishwasher leaking',
    description: 'Water is pooling under the dishwasher after each cycle. Appears to be a leak from the bottom.',
    priority: 'high',
    status: 'acknowledged',
    location: 'Kitchen',
    urgency_level: 'same_day',
    guest_ip: '192.168.1.101',
    admin_notified: true,
    amenity_name: 'Gourmet Kitchen',
    amenity_category: 'kitchen',
    created_at: new Date('2025-10-04T09:15:00Z'),
    updated_at: new Date('2025-10-04T09:45:00Z')
  },
  {
    id: 3,
    property_id: 2,
    amenity_id: null,
    guest_name: 'Mike Wilson',
    guest_room: 'Cabin A',
    guest_phone: '+1-555-0789',
    category: 'supplies',
    title: 'Need more towels',
    description: 'We need additional bath towels for our group of 6 people.',
    priority: 'low',
    status: 'new',
    location: 'Bathroom',
    urgency_level: 'not_urgent',
    guest_ip: '192.168.1.102',
    admin_notified: false,
    created_at: new Date('2025-10-04T08:00:00Z'),
    updated_at: new Date('2025-10-04T08:00:00Z')
  },
  {
    id: 4,
    property_id: 1,
    amenity_id: 2, // Hot Tub
    guest_name: 'Lisa Chen',
    guest_room: '103',
    guest_phone: '+1-555-0321',
    category: 'amenities',
    title: 'Hot tub jets not working',
    description: 'The hot tub is heating properly but none of the jets are functioning. No bubbles or water circulation.',
    priority: 'urgent',
    status: 'in_progress',
    location: 'Hot Tub Area',
    urgency_level: 'immediate',
    guest_ip: '192.168.1.103',
    admin_notified: true,
    amenity_name: 'Hot Tub',
    amenity_category: 'recreation',
    resolved_by: 2, // Company admin
    created_at: new Date('2025-10-04T07:30:00Z'),
    updated_at: new Date('2025-10-04T11:00:00Z')
  }
];

export class MockIntegratedReportService extends IntegratedReportService {
  
  async createReport(reportData: Omit<GuestReport, 'id' | 'created_at' | 'updated_at'>): Promise<GuestReport> {
    const newReport: GuestReportWithAmenity = {
      id: mockGuestReports.length + 1,
      ...reportData,
      status: reportData.status || 'new',
      admin_notified: reportData.admin_notified || false,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    // Add amenity information if amenity_id is provided
    if (reportData.amenity_id) {
      const { mockAmenities } = await import('../utils/mock-database');
      const amenity = mockAmenities.find(a => a.id === reportData.amenity_id);
      if (amenity) {
        newReport.amenity_name = amenity.name;
        newReport.amenity_category = amenity.category;
      }
    }
    
    mockGuestReports.push(newReport);
    
    // Simulate Super Admin notification for urgent amenity issues
    if (reportData.amenity_id && (reportData.priority === 'urgent' || reportData.urgency_level === 'immediate')) {
      console.log(`🚨 MOCK SUPER ADMIN ALERT: Urgent amenity issue reported - Report ID: ${newReport.id}`);
      newReport.admin_notified = true;
    }
    
    return newReport;
  }
  
  async getReportById(id: number): Promise<GuestReport> {
    const report = mockGuestReports.find(r => r.id === id);
    if (!report) {
      throw new Error('Report not found');
    }
    return report;
  }
  
  async getReportsByProperty(propertyId: number): Promise<GuestReportWithAmenity[]> {
    return mockGuestReports
      .filter(r => r.property_id === propertyId)
      .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());
  }
  
  async getReportsByAmenity(amenityId: number): Promise<GuestReportWithAmenity[]> {
    return mockGuestReports
      .filter(r => r.amenity_id === amenityId)
      .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());
  }
  
  async getAllReports(): Promise<GuestReportWithAmenity[]> {
    const { mockProperties, mockCompanies } = await import('../utils/mock-database');
    
    return mockGuestReports.map(report => {
      const property = mockProperties.find(p => p.id === report.property_id);
      const company = property ? mockCompanies.find(c => c.id === property.company_id) : null;
      
      return {
        ...report,
        property_name: property?.name || 'Unknown Property',
        company_name: company?.name || 'Unknown Company'
      } as GuestReportWithAmenity & { property_name: string; company_name: string };
    }).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());
  }
  
  async updateReportStatus(
    id: number, 
    status: GuestReport['status'], 
    resolvedBy?: number, 
    resolutionNotes?: string
  ): Promise<GuestReport> {
    const reportIndex = mockGuestReports.findIndex(r => r.id === id);
    if (reportIndex === -1) {
      throw new Error('Report not found');
    }
    
    mockGuestReports[reportIndex] = {
      ...mockGuestReports[reportIndex],
      status,
      resolved_by: resolvedBy || null,
      resolution_notes: resolutionNotes || undefined,
      resolved_at: (status === 'resolved' || status === 'closed') ? new Date() : null,
      updated_at: new Date()
    };
    
    console.log(`📝 MOCK: Report ${id} status updated to ${status} by user ${resolvedBy}`);
    
    return mockGuestReports[reportIndex];
  }
  
  async notifySuperAdminForAmenityIssues(reportId: number): Promise<void> {
    const reportIndex = mockGuestReports.findIndex(r => r.id === reportId);
    if (reportIndex !== -1) {
      mockGuestReports[reportIndex].admin_notified = true;
      console.log(`🚨 MOCK SUPER ADMIN ALERT: Urgent amenity issue reported - Report ID: ${reportId}`);
    }
  }
  
  async getReportsNeedingAdminAttention(): Promise<GuestReportWithAmenity[]> {
    const { mockProperties, mockCompanies } = await import('../utils/mock-database');
    
    const urgentReports = mockGuestReports.filter(report => 
      (report.priority === 'urgent' || report.urgency_level === 'immediate') &&
      ['new', 'acknowledged'].includes(report.status) &&
      report.amenity_id !== null
    );
    
    return urgentReports.map(report => {
      const property = mockProperties.find(p => p.id === report.property_id);
      const company = property ? mockCompanies.find(c => c.id === property.company_id) : null;
      
      return {
        ...report,
        property_name: property?.name || 'Unknown Property',
        company_name: company?.name || 'Unknown Company'
      } as GuestReportWithAmenity & { property_name: string; company_name: string };
    }).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());
  }
  
  async autoCloseAmenityReports(amenityId: number, resolvedBy: number, notes: string): Promise<number> {
    let affectedCount = 0;
    
    mockGuestReports.forEach((report, index) => {
      if (report.amenity_id === amenityId && ['new', 'acknowledged', 'in_progress'].includes(report.status)) {
        mockGuestReports[index] = {
          ...report,
          status: 'resolved',
          resolved_by: resolvedBy,
          resolution_notes: notes,
          resolved_at: new Date(),
          updated_at: new Date()
        };
        affectedCount++;
      }
    });
    
    if (affectedCount > 0) {
      console.log(`📝 MOCK: Auto-closed ${affectedCount} reports for amenity ${amenityId} by user ${resolvedBy}`);
    }
    
    return affectedCount;
  }
  
  // Mock-specific method to get current mock data
  getMockData(): GuestReportWithAmenity[] {
    return [...mockGuestReports];
  }
  
  // Mock-specific method to reset data
  resetMockData(): void {
    mockGuestReports = mockGuestReports.slice(0, 4); // Keep original 4 reports
  }
}
