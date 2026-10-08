// Mock Database for Local Testing (simulates Plesk MySQL responses)

export const MOCK_MODE = process.env.MOCK_DATABASE === 'true';

// Mock Users
export const mockUsers = [
  {
    id: 1,
    email: 'admin@stayguide.com',
    password_hash: '$2a$10$0aVSMGtGwqojteMJaEDN0e3ejGGIEl4dutZchscGebTG0suWdxzU2', // admin123
    first_name: 'Super',
    last_name: 'Admin',
    role: 'super_admin',
    company_id: undefined,
    status: 'active',
    last_login: new Date(),
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 2,
    email: 'admin@demorentals.com',
    password_hash: '$2a$10$Xu6U.GuHIL0SH2PIi/hAe.YnZhtohIUFnZXh3c7EWfZ6JFdMjbf2O', // demo123
    first_name: 'Demo',
    last_name: 'Admin',
    role: 'company_admin',
    company_id: 1,
    status: 'active',
    last_login: new Date(),
    created_at: new Date(),
    updated_at: new Date()
  },
  // 2026-10-07 21:55, G7 demo field worker (Demo Rentals team), so /maint has a login that survives restarts
  {
    id: 3,
    email: 'tech@demorentals.com',
    password_hash: '$2a$10$.dRPGWGWDo7OPHw/bzouEugUKwLpCYy54molp02oEPrFjqqT76P0a', // tech1234
    first_name: 'Terry',
    last_name: 'Tech',
    role: 'field_worker',
    company_id: undefined,
    status: 'active',
    last_login: null as Date | null,
    created_at: new Date(),
    updated_at: new Date()
  }
];

// Mock Companies
export const mockCompanies = [
  {
    id: 1,
    name: 'Demo Rentals LLC',
    slug: 'demo-rentals',
    email: 'admin@demorentals.com',
    phone: '+1-555-0123',
    address: '123 Main Street, Anytown, ST 12345',
    logo_url: undefined,
    status: 'active',
    connection_fee: 50.00,
    monthly_fee_per_property: 29.99,
    plan: 'pro', // 2026-10-03 23:06, demo companies are grandfathered (legacy manual billing)
    subscription_status: 'legacy',
    ops_addon: true, // 2026-10-07 18:30, G7 S1: demo company has the Ops add-on
    ops_approval_threshold: 250, // 2026-10-07 22:10, G7 S2
    timezone: 'America/Denver', // 2026-10-08 10:40, G7 S8
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 2,
    name: 'Ocean View Properties',
    slug: 'ocean-view',
    email: 'contact@oceanview.com',
    phone: '+1-555-0456',
    address: '456 Beach Blvd, Coastal City, CA 90210',
    logo_url: undefined,
    status: 'active',
    connection_fee: 75.00,
    monthly_fee_per_property: 39.99,
    plan: 'pro', // 2026-10-03 23:06, demo companies are grandfathered (legacy manual billing)
    subscription_status: 'legacy',
    ops_approval_threshold: 250, // 2026-10-07 22:10, G7 S2
    timezone: 'America/Denver', // 2026-10-08 10:40, G7 S8
    created_at: new Date(),
    updated_at: new Date()
  }
];

// Mock Properties
export const mockProperties = [
  {
    id: 1,
    company_id: 1,
    name: 'Seaside Villa',
    slug: 'seaside-villa',
    address: '456 Ocean Drive, Beach City, CA 90210',
    description: 'Beautiful oceanfront villa with stunning views and modern amenities.',
    main_image_url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
    wifi_name: 'SeasideVilla_Guest',
    wifi_password: 'welcome2023',
    check_in_instructions: 'Check-in is at 3:00 PM. The lockbox code is 1234. Keys are in the lockbox by the front door.',
    check_out_instructions: 'Check-out is at 11:00 AM. Please leave keys in the lockbox and ensure all windows and doors are locked.',
    house_rules: 'No smoking indoors. No pets allowed. Quiet hours are 10 PM to 8 AM. Maximum 6 guests.',
    emergency_contact: 'Emergency Contact: Property Manager - (555) 123-4567',
    // 2026-10-03 15:29, tablet appearance defaults
    tablet_theme: 'auto',
    background_image_url: null,
    // 2026-10-06 15:25, demo properties show the Baltic Rose gradient
    tablet_background: 'baltic-rose', latitude: 34.0195, longitude: -118.4912, temperature_unit: 'F', clock_format: '12h', // 2026-10-03 17:00 Santa Monica demo coordinates // 2026-10-03 16:42
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 2,
    company_id: 1,
    name: 'Mountain Cabin',
    slug: 'mountain-cabin',
    address: '789 Pine Trail, Mountain View, CO 80424',
    description: 'Cozy mountain cabin perfect for winter getaways.',
    main_image_url: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800',
    wifi_name: 'MountainCabin_WiFi',
    wifi_password: 'alpine2023',
    check_in_instructions: 'Check-in after 4:00 PM. Key safe code is 5678.',
    check_out_instructions: 'Check-out by 10:00 AM. Please lock all doors.',
    house_rules: 'No smoking. Pets welcome with deposit. Quiet hours 9 PM to 8 AM.',
    emergency_contact: 'Mountain Rescue: (555) 999-0000',
    tablet_theme: 'auto',
    background_image_url: null,
    // 2026-10-06 15:25, demo properties show the Baltic Rose gradient
    tablet_background: 'baltic-rose', latitude: null, longitude: null, temperature_unit: 'F', clock_format: '12h', // 2026-10-03 16:42
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  }
];

// Mock Amenities
export const mockAmenities = [
  {
    id: 1,
    property_id: 1,
    name: 'Private Pool',
    description: 'Heated saltwater pool with ocean views',
    icon: '🏊‍♂️',
    image_url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400',
    category: 'recreation',
    display_order: 1,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 2,
    property_id: 1,
    name: 'Hot Tub',
    description: 'Relaxing spa hot tub for 6 people',
    icon: '🛁',
    image_url: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=400',
    category: 'recreation',
    display_order: 2,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 3,
    property_id: 1,
    name: 'Gourmet Kitchen',
    description: 'Fully equipped kitchen with high-end appliances',
    icon: '👨‍🍳',
    image_url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400',
    category: 'kitchen',
    display_order: 3,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 4,
    property_id: 1,
    name: 'Beach Access',
    description: 'Private walkway to the beach',
    icon: '🏖️',
    image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
    category: 'location',
    display_order: 4,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 5,
    property_id: 2,
    name: 'Fireplace',
    description: 'Cozy wood-burning fireplace',
    icon: '🔥',
    image_url: 'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=400',
    category: 'comfort',
    display_order: 1,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 6,
    property_id: 2,
    name: 'Mountain Views',
    description: 'Panoramic mountain views from every room',
    icon: '🏔️',
    image_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
    category: 'location',
    display_order: 2,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 7,
    property_id: 2,
    name: 'Hiking Trails',
    description: 'Direct access to mountain hiking trails',
    icon: '🥾',
    image_url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=400',
    category: 'recreation',
    display_order: 3,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 8,
    property_id: 2,
    name: 'Game Room',
    description: 'Recreation room with pool table and games',
    icon: '🎯',
    image_url: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400',
    category: 'recreation',
    display_order: 4,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date()
  }
];

// Mock Restaurants
export const mockRestaurants: any[] = [
  {
    id: 1,
    property_id: 1,
    name: 'Ocean Breeze Café',
    image_url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=300',
    rating: 4.5,
    distance: '0.2 miles',
    category: 'breakfast',
    google_maps_url: 'https://maps.google.com/?q=Ocean+Breeze+Cafe',
    description: 'Fantastic breakfast spot with ocean views. Try their famous pancakes!',
    display_order: 1,
    status: 'active'
  },
  {
    id: 2,
    property_id: 1,
    name: 'Coastal Bistro',
    image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=300',
    rating: 4.7,
    distance: '0.5 miles',
    category: 'dinner',
    google_maps_url: 'https://maps.google.com/?q=Coastal+Bistro',
    description: 'Upscale dining with fresh seafood and local ingredients.',
    display_order: 2,
    status: 'active'
  }
];

// Mock Announcements
export const mockAnnouncements: any[] = [
  {
    id: 1,
    property_id: 1,
    title: 'Weekly Pool Cleaning',
    message: 'Pool cleaning service will be performed every Wednesday from 9:00 AM to 11:00 AM. Pool will be temporarily unavailable during this time.',
    type: 'info',
    scheduled_start: null,
    scheduled_end: null,
    status: 'active',
    created_by: 2,
    created_at: new Date()
  }
];

// 2026-10-04 00:26, G4 mock section analytics
export const mockSectionEvents: any[] = [];

// 2026-10-03 23:06, G3 mock billing state
export const mockStripeEvents: Set<string> = new Set();
export const mockHardwareOrders: any[] = [];

// 2026-10-03 22:25, mock how-to videos, local info and welcome text (were hard-coded in MockPropertyService)
export const mockVideos: any[] = [
  {
    id: 1,
    property_id: 1,
    title: 'How to use the smart lock',
    video_url: 'https://youtube.com/watch?v=demo1',
    thumbnail_url: null,
    description: 'Quick tutorial on using the electronic door lock system.',
    display_order: 1,
    status: 'active'
  }
];

export const mockLocalInfo: any[] = [
  {
    id: 1,
    property_id: 1,
    category: 'attractions',
    title: 'Beach City Pier',
    description: 'Historic pier with fishing, shops, and restaurants.',
    address: null,
    phone: '(555) 987-6543',
    website_url: null,
    google_maps_url: null,
    display_order: 1,
    status: 'active'
  }
];

export const mockPropertyContent: any[] = [
  { id: 1, property_id: 1, welcome_message: 'Welcome to our beautiful property! We hope you have a wonderful stay.', weather_widget: true }
];

// 2026-10-03 12:32, Mock link clicks (direct-booking / review QR scans)
export const mockLinkClicks: any[] = [];

// 2026-10-03 11:39, Mock Devices (paired tablets); starts empty, filled by pairing flow
export const mockDevices: any[] = [];

// 2026-10-07 16:00, helpdesk (helpdesk_tickets / helpdesk_responses); starts empty
export const mockHelpdeskTickets: any[] = [];
export const mockHelpdeskResponses: any[] = [];

// 2026-10-07 18:30, G7 Ops stage 1 (company_workers / worker_invites / login_codes); start empty
export const mockCompanyWorkers: any[] = [
  { id: 1, company_id: 1, user_id: 3, worker_type: 'tech', status: 'active', skills: ['plumbing', 'hvac'], phone: null, hourly_rate: 35, invited_by: 2, created_at: new Date(), updated_at: new Date() }
];
export const mockWorkerInvites: any[] = [];
export const mockLoginCodes: any[] = [];

// 2026-10-07 22:10, G7 Ops stage 2: two demo jobs for Demo Rentals (one assigned to Terry Tech, one unassigned)
const today = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
export const mockWorkOrders: any[] = [
  { id: 1, company_id: 1, property_id: 1, amenity_id: 1, guest_report_id: null, type: 'maintenance', title: 'Pool heater check',
    description: 'Guests say the pool is cold. Check the heater and the thermostat setting.', priority: 'high', status: 'assigned',
    assignee_user_id: 3, window_start: today(13), window_end: today(17), due_at: today(18), cost_estimate: null, cost_actual: null,
    approved_amount: null, approved_by: null, approved_at: null, completion_notes: null, created_by: 2, created_at: new Date(), updated_at: new Date() },
  { id: 2, company_id: 1, property_id: 2, amenity_id: null, guest_report_id: null, type: 'inspection', title: 'Smoke detector batteries',
    description: 'Test every smoke and CO detector, replace batteries where needed.', priority: 'medium', status: 'new',
    assignee_user_id: null, window_start: null, window_end: null, due_at: null, cost_estimate: null, cost_actual: null,
    approved_amount: null, approved_by: null, approved_at: null, completion_notes: null, created_by: 2, created_at: new Date(), updated_at: new Date() }
];
// 2026-10-08 00:20, G7 Ops stage 3: QR stickers, job photos, time entries (start empty; access codes are set from the dashboard)
export const mockPropertyAccess: any[] = []; // { property_id, access_code_enc, access_notes }
export const mockQrTokens: any[] = [];
export const mockWorkOrderPhotos: any[] = [];
export const mockTimeEntries: any[] = [];
export const mockTimeEntryEdits: any[] = []; // 2026-10-08 09:00, G7 S7

// 2026-10-08 02:30, G7 Ops stage 4: demo checklist templates for Demo Rentals; job checklists start empty
export const mockChecklistTemplates: any[] = [
  { id: 1, company_id: 1, name: 'Turnover clean', type: 'cleaning', active: true, created_by: 2, created_at: new Date(), updated_at: new Date() },
  { id: 2, company_id: 1, name: 'Monthly safety inspection', type: 'inspection', active: true, created_by: 2, created_at: new Date(), updated_at: new Date() }
];
export const mockChecklistTemplateItems: any[] = [
  { id: 1, template_id: 1, label: 'Strip beds and make with fresh linen', requires_photo: true, position: 0 },
  { id: 2, template_id: 1, label: 'Clean bathrooms (toilet, shower, sink, mirror)', requires_photo: true, position: 1 },
  { id: 3, template_id: 1, label: 'Kitchen: dishes, counters, fridge emptied', requires_photo: false, position: 2 },
  { id: 4, template_id: 1, label: 'Restock toilet paper, soap, coffee', requires_photo: false, position: 3 },
  { id: 5, template_id: 1, label: 'Vacuum and mop all floors', requires_photo: false, position: 4 },
  { id: 6, template_id: 1, label: 'Living room ready (photo for the listing check)', requires_photo: true, position: 5 },
  { id: 7, template_id: 2, label: 'Test every smoke and CO detector', requires_photo: false, position: 0 },
  { id: 8, template_id: 2, label: 'Fire extinguisher present and charged', requires_photo: true, position: 1 },
  { id: 9, template_id: 2, label: 'Check for leaks under sinks and around the water heater', requires_photo: false, position: 2 }
];
export const mockWorkOrderChecklist: any[] = [];

// 2026-10-08 05:00, G7 Ops stage 5: replayed client operations + web push subscriptions
export const mockClientOps: any[] = [];
export const mockPushSubscriptions: any[] = [];

// 2026-10-08 07:10, G7 Ops stage 6: vendor profiles (insurance certificates); start empty
export const mockVendorProfiles: any[] = [];

// 2026-10-08 10:40, G7 Ops stage 8: one demo schedule (monthly safety inspection at Mountain Cabin, unassigned)
const firstOfNextMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
export const mockMaintenanceSchedules: any[] = [
  { id: 1, company_id: 1, property_id: 2, title: 'Monthly safety inspection', description: 'Detectors, extinguisher, leaks.', type: 'inspection', priority: 'medium',
    checklist_template_id: 2, default_assignee_user_id: null, recurrence: 'monthly', interval_days: null, weekday: null, month_day: 1,
    window_start_time: '09:00', window_hours: 4, lead_days: 3, next_due_on: firstOfNextMonth(), active: true, last_order_id: null, created_by: 2, created_at: new Date(), updated_at: new Date() }
];

export const mockWorkOrderEvents: any[] = [
  { id: 1, work_order_id: 1, actor_user_id: 2, action: 'created', note: null, data: null, created_at: new Date() },
  { id: 2, work_order_id: 1, actor_user_id: 2, action: 'assigned', note: null, data: { assignee_user_id: 3 }, created_at: new Date() },
  { id: 3, work_order_id: 2, actor_user_id: 2, action: 'created', note: null, data: null, created_at: new Date() }
];

// Utility function to simulate database delay
export const mockDelay = (ms: number = 300) => 
  new Promise(resolve => setTimeout(resolve, ms));

// Mock database error simulation
export const simulateRandomError = () => {
  if (Math.random() < 0.1) { // 10% chance of error for testing
    throw new Error('Simulated database connection error');
  }
};