export const SETTINGS_KEYS = [
  'spaceship_api_key',
  'dataforseo_api_key',
  'claude_api_key',
  'amazon_affiliate_tag',
  'vps2_host',
  'vps2_user',
  'vps2_sites_root',
] as const

export type SettingsKey = (typeof SETTINGS_KEYS)[number]
