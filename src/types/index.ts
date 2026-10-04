import { Request } from 'express';

export interface Company {
  id: number;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  address?: string;
  logo_url?: string;
  status: 'active' | 'inactive' | 'suspended';
  connection_fee: number;
  monthly_fee_per_property: number;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'super_admin' | 'company_admin';
  company_id?: number;
  status: 'active' | 'inactive';
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Property {
  id: number;
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
  main_image_url?: string | null;
  // 2026-10-03 12:32, Phase 5 guest links
  direct_booking_url?: string | null;
  review_url?: string | null;
  return_guest_offer?: string | null;
  guest_checkout_date?: string | Date | null;
  // 2026-10-03 15:29, tablet appearance (managed per property)
  tablet_theme?: 'auto' | 'light' | 'dark';
  background_image_url?: string | null;
  // 2026-10-03 16:42, 'image' uses background_image_url; gradients force the dark treatment
  // 2026-10-03 17:00, weather location + clock/temperature preferences (DECIMAL columns may arrive as strings from MySQL)
  latitude?: number | string | null;
  longitude?: number | string | null;
  temperature_unit?: 'F' | 'C';
  clock_format?: '12h' | '24h';
  tablet_background?: string; // 'solid' | 'image' | a gradient slug from public/js/tablet-backgrounds.js
  // 2026-10-03 22:42, G2 public guide link
  guest_link_token?: string | null;
  guest_link_show_wifi?: boolean | number;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

// 2026-10-03 11:39, paired in-home devices (tablets now; sensors etc. later via `type`)
export interface Device {
  id: number;
  property_id: number;
  type: 'tablet';
  name?: string;
  token_hash?: string | null;
  pairing_code?: string | null;
  pairing_expires_at?: Date | null;
  last_seen_at?: Date | null;
  status: 'pending' | 'active' | 'revoked';
  created_at: Date;
}

export interface AuthRequest extends Request {
  user?: User;
  device?: Device;
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  companyId?: number;
}

export * from './billing';
export * from './email';