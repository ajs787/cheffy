import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';

/** The creator invites people (re-inviting asks again after a decline). */
export async function inviteCollaborators(postId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  unwrap(await supabase.rpc('invite_collaborators', { p_post: postId, p_users: userIds }));
}

export async function respondToCollaboration(postId: string, accept: boolean): Promise<void> {
  unwrap(await supabase.rpc('respond_to_collaboration', { p_post: postId, p_accept: accept }));
}

/** Leave (your own id) or, as the creator, remove someone. */
export async function removeCollaborator(postId: string, userId: string): Promise<void> {
  unwrap(await supabase.rpc('remove_collaborator', { p_post: postId, p_user: userId }));
}

/** Your own rating and review of a shared creation. */
export async function setMyEvaluation(postId: string, rating: number, review: string): Promise<void> {
  unwrap(await supabase.rpc('set_my_evaluation', { p_post: postId, p_rating: rating, p_review: review }));
}
