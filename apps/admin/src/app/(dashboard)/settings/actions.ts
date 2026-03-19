"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { SETTINGS_KEYS } from "./constants";
import { AGENT_KEYS } from "@monster/agents";

const SaveSettingsSchema = z.object({
  anthropic_api_key: z.string().optional(),
  spaceship_api_key: z.string().optional(),
  spaceship_api_secret: z.string().optional(),
  spaceship_contact_id: z.string().optional(),
  dataforseo_api_key: z.string().optional(),
  hetzner_api_token: z.string().optional(),
  cloudflare_api_token: z.string().optional(),
});

export type SaveSettingsErrors = {
  anthropic_api_key?: string[];
  spaceship_api_key?: string[];
  spaceship_api_secret?: string[];
  spaceship_contact_id?: string[];
  dataforseo_api_key?: string[];
  hetzner_api_token?: string[];
  cloudflare_api_token?: string[];
  _form?: string[];
};

export type SaveSettingsState = {
  success?: boolean;
  errors?: SaveSettingsErrors;
} | null;

export async function saveSettings(
  _prevState: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  const raw = Object.fromEntries(
    SETTINGS_KEYS.map((key) => [key, (formData.get(key) as string | null) ?? ""]),
  );

  const result = SaveSettingsSchema.safeParse(raw);

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors as SaveSettingsErrors };
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  for (const key of SETTINGS_KEYS) {
    const rawValue = result.data[key];

    // Skip empty — no-op semantics: empty field = don't touch existing value
    if (!rawValue || rawValue.trim() === "") continue;

    const { error } = await supabase
      .from("settings")
      .upsert({ key, value: { value: rawValue }, updated_at: now }, { onConflict: "key" });

    if (error) {
      throw new Error(`Failed to upsert setting '${key}': ${error.message} (code: ${error.code})`);
    }
  }

  revalidatePath("/settings");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Agent Prompts
// ---------------------------------------------------------------------------

export type SaveAgentPromptsState = {
  success?: boolean;
  error?: string;
} | null;

export async function saveAgentPrompts(
  _prevState: SaveAgentPromptsState,
  formData: FormData,
): Promise<SaveAgentPromptsState> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const agentKeyValues = Object.values(AGENT_KEYS);

  for (const agentKey of agentKeyValues) {
    const content = (formData.get(`agent_prompt_${agentKey}`) as string | null)?.trim() ?? "";
    // Empty = delete the override (restore to default)
    if (!content) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("agent_prompts")
        .delete()
        .eq("agent_key", agentKey)
        .eq("prompt_type", "system");
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("agent_prompts")
      .upsert(
        { agent_key: agentKey, prompt_type: "system", content, updated_at: now },
        { onConflict: "agent_key,prompt_type" },
      );

    if (error) {
      return { error: `Failed to save prompt for ${agentKey}: ${error.message}` };
    }
  }

  revalidatePath("/settings");
  return { success: true };
}
