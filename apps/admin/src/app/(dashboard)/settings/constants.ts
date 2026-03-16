export const SETTINGS_KEYS = [
  'spaceship_api_key',
  'spaceship_api_secret',
  'spaceship_contact_id',
  'dataforseo_api_key',
  'hetzner_api_token',
  'cloudflare_api_token',
] as const

export type SettingsKey = (typeof SETTINGS_KEYS)[number]
