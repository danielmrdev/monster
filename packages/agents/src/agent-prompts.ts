/**
 * Agent prompt helpers — read user-edited system prompts from the agent_prompts table.
 *
 * Pattern: DB override takes precedence over hardcoded default.
 * If the table has no row for (agentKey, promptType), the fallback is returned.
 *
 * D132: agent_prompts table with unique (agent_key, prompt_type).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Known agent keys — used as agent_key values in agent_prompts table.
 * Import this in UI code to populate the editor with canonical keys.
 */
export const AGENT_KEYS = {
  CONTENT_GENERATOR: 'content_generator',
  NICHE_RESEARCHER: 'niche_researcher',
  MONSTER: 'monster',
} as const;

export type AgentKey = (typeof AGENT_KEYS)[keyof typeof AGENT_KEYS];

/**
 * Read an agent system prompt from the DB, falling back to the hardcoded default.
 *
 * @param supabase Service-role Supabase client
 * @param agentKey  e.g. 'content_generator'
 * @param promptType  usually 'system'
 * @param fallback  The hardcoded default prompt to use if no DB override exists
 */
export async function getAgentPrompt(
  supabase: SupabaseClient,
  agentKey: string,
  promptType: string,
  fallback: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('agent_prompts')
    .select('content')
    .eq('agent_key', agentKey)
    .eq('prompt_type', promptType)
    .maybeSingle();

  if (error) {
    console.warn(
      `[getAgentPrompt] failed to read prompt for ${agentKey}/${promptType}: ${error.message} — using default`,
    );
    return fallback;
  }

  if (data?.content) {
    console.log(`[getAgentPrompt] using DB override for ${agentKey}/${promptType}`);
    return data.content;
  }

  return fallback;
}
