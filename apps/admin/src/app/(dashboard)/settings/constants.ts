export const SETTINGS_KEYS = [
  'spaceship_api_key',
  'dataforseo_api_key',
  'claude_api_key',
  'amazon_affiliate_tag',
] as const

export type SettingsKey = (typeof SETTINGS_KEYS)[number]
