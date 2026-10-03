// 2026-10-03 11:34, column whitelists for dynamic UPDATE statements (fixes SQL injection via request-body keys)

export const PROPERTY_UPDATE_FIELDS = [
  'name', 'slug', 'address', 'description', 'wifi_name', 'wifi_password',
  'check_in_instructions', 'check_out_instructions', 'house_rules',
  'emergency_contact', 'main_image_url', 'status',
  // 2026-10-03 12:32, Phase 5 guest links
  'direct_booking_url', 'review_url', 'return_guest_offer', 'guest_checkout_date'
] as const;

export const AMENITY_UPDATE_FIELDS = [
  'name', 'description', 'icon', 'image_url', 'category', 'display_order', 'status'
] as const;

// Only Super Admin code paths may set these (see AdminAmenityController.updateAmenity)
export const AMENITY_ADMIN_FIELDS = ['approved_by_admin', 'is_admin_managed'] as const;

export const COMPANY_UPDATE_FIELDS = [
  'name', 'slug', 'email', 'phone', 'address', 'logo_url', 'status',
  'connection_fee', 'monthly_fee_per_property'
] as const;

export const USER_UPDATE_FIELDS = [
  'email', 'password_hash', 'first_name', 'last_name', 'role',
  'company_id', 'status', 'last_login'
] as const;

/**
 * Keep only whitelisted keys with defined values. Column names in the
 * resulting SET clause therefore never come from user input.
 */
export const pickAllowedFields = (
  updates: Record<string, any> | null | undefined,
  allowed: readonly string[]
): Record<string, any> => {
  const picked: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (allowed.includes(key) && value !== undefined) {
      picked[key] = value;
    }
  }
  return picked;
};

export const buildSetClause = (fields: Record<string, any>) => ({
  setClause: Object.keys(fields).map(key => `${key} = ?`).join(', '),
  values: Object.values(fields)
});
