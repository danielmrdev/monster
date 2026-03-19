import { z } from "zod";

/**
 * Zod schema for the site customization JSON blob.
 * All fields are optional strings — stored as JSONB in `sites.customization`.
 * Importable by both `apps/admin` (validation) and `apps/generator` (rendering).
 */
export const SiteCustomizationSchema = z.object({
  primaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontFamily: z.string().optional(),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  faviconDir: z.string().optional(),
});

export type SiteCustomization = z.infer<typeof SiteCustomizationSchema>;
