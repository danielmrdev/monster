'use server';

import { createServiceClient } from '@/lib/supabase/service';

/**
 * Fetch the 20 most-recently-updated conversations for the sidebar list.
 * Ordered by updated_at DESC so the most active conversation appears first.
 *
 * Observability: if the list is empty, check chat_conversations table in Supabase.
 */
export async function getConversations(): Promise<
  Array<{ id: string; title: string | null; created_at: string; updated_at: string }>
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[monster/chat] getConversations error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch all messages for a conversation, oldest-first.
 * Used to restore conversation history when navigating to ?c=<id>.
 *
 * Observability: check chat_messages table WHERE conversation_id='<id>'
 */
export async function getMessages(
  conversationId: string,
): Promise<Array<{ id: string; role: string; content: string; created_at: string }>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[monster/chat] getMessages error:', error.message, 'conversationId:', conversationId);
    return [];
  }

  return data ?? [];
}

/**
 * Delete a conversation and its messages.
 * FK cascade handles message deletion if configured; otherwise deletes messages first.
 *
 * Observability: after delete, SELECT COUNT(*) FROM chat_messages WHERE conversation_id='<id>' should be 0.
 */
export async function deleteConversation(id: string): Promise<{ error?: string }> {
  const supabase = createServiceClient();

  // Delete messages first in case FK cascade is not configured
  const { error: msgError } = await supabase
    .from('chat_messages')
    .delete()
    .eq('conversation_id', id);

  if (msgError) {
    console.error('[monster/chat] deleteConversation: failed to delete messages:', msgError.message);
    return { error: msgError.message };
  }

  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[monster/chat] deleteConversation error:', error.message);
    return { error: error.message };
  }

  return {};
}
