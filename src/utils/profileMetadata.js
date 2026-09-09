// Only these account-profile fields may be written through the browser client.
// Billing, trial, beta, admin, and desktop-entitlement fields belong in
// Supabase app_metadata and must only be changed by trusted server code.
export const EDITABLE_PROFILE_METADATA_KEYS = new Set([
  'full_name',
  'name',
  'alias',
  'writer_alias',
  'bio',
  'website',
  'avatar_url',
  'theme',
  'custom_theme_colors',
  'theme_radius_unit',
  'theme_visual_strength',
  'tour_progress',
  'free_project_id',
])

export function sanitizeEditableProfileMetadata(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new TypeError('Profile metadata must be an object.')
  }

  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => EDITABLE_PROFILE_METADATA_KEYS.has(key))
  )
}
