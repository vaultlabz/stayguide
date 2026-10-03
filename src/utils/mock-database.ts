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
export const mockRestaurants = [
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
export const mockAnnouncements = [
  {
    id: 1,
    property_id: 1,
    title: 'Weekly Pool Cleaning',
    message: 'Pool cleaning service will be performed every Wednesday from 9:00 AM to 11:00 AM. Pool will be temporarily unavailable during this time.',
    type: 'info',
    status: 'active',
    created_at: new Date()
  }
];

// 2026-10-03 12:32, Mock link clicks (direct-booking / review QR scans)
export const mockLinkClicks: any[] = [];

// 2026-10-03 11:39, Mock Devices (paired tablets); starts empty, filled by pairing flow
export const mockDevices: any[] = [];

// Utility function to simulate database delay
export const mockDelay = (ms: number = 300) => 
  new Promise(resolve => setTimeout(resolve, ms));

// Mock database error simulation
export const simulateRandomError = () => {
  if (Math.random() < 0.1) { // 10% chance of error for testing
    throw new Error('Simulated database connection error');
  }
};