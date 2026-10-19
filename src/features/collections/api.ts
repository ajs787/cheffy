import { attachImageUrls, mapPosts, POST_SELECT, type PostRow } from '@/features/posts/mappers';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { fetchOne, fetchRows } from '@/lib/supabase/query';
import { signPostImagePaths } from '@/lib/supabase/storage';
import type { Collection, Cursor, Page, Post } from '@/types/models';

const ALREADY_EXISTS = '23505';

const COLLECTION_SELECT = `
  id, owner_id, name, description, visibility, updated_at,
  item_count:collection_items(count),
  cover:collection_items(added_at, post:posts(images:post_images(thumb_path, position)))
`;

interface CollectionRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  updated_at: string;
  item_count: { count: number }[];
  cover: { added_at: string; post: { images: { thumb_path: string; position: number }[] } | null }[];
}

function coverPathOf(row: CollectionRow): string | null {
  const images = row.cover[0]?.post?.images ?? [];
  return [...images].sort((a, b) => a.position - b.position)[0]?.thumb_path ?? null;
}

async function mapCollections(rows: CollectionRow[]): Promise<Collection[]> {
  const paths = rows.map(coverPathOf).filter((p): p is string => p !== null);
  const urls = paths.length ? await signPostImagePaths(paths) : {};
  return rows.map((row) => {
    const coverPath = coverPathOf(row);
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      itemCount: row.item_count[0]?.count ?? 0,
      coverPath,
      coverUrl: coverPath ? (urls[coverPath] ?? null) : null,
      updatedAt: row.updated_at,
    };
  });
}

/** Collections with their item count and the most recently added post as cover. */
function collectionsQuery() {
  return supabase
    .from('collections')
    .select(COLLECTION_SELECT)
    .order('added_at', { referencedTable: 'cover', ascending: false })
    .limit(1, { referencedTable: 'cover' });
}

export async function fetchCollections(ownerId: string): Promise<Collection[]> {
  const rows = await fetchRows<CollectionRow>(
    collectionsQuery().eq('owner_id', ownerId).order('updated_at', { ascending: false }),
  );
  return mapCollections(rows);
}

export async function fetchCollection(id: string): Promise<Collection | null> {
  const rows = await fetchRows<CollectionRow>(collectionsQuery().eq('id', id));
  const [collection] = await mapCollections(rows);
  return collection ?? null;
}

export interface CollectionInput {
  name: string;
  description: string;
  visibility: 'public' | 'private';
}

export async function createCollection(ownerId: string, input: CollectionInput): Promise<string> {
  const row = await fetchOne<{ id: string }>(
    supabase
      .from('collections')
      .insert({
        owner_id: ownerId,
        name: input.name.trim(),
        description: input.description.trim(),
        visibility: input.visibility,
      })
      .select('id')
      .single(),
  );
  return row.id;
}

export async function updateCollection(id: string, input: CollectionInput): Promise<void> {
  unwrap(
    await supabase
      .from('collections')
      .update({ name: input.name.trim(), description: input.description.trim(), visibility: input.visibility })
      .eq('id', id),
  );
}

export async function deleteCollection(id: string): Promise<void> {
  unwrap(await supabase.from('collections').delete().eq('id', id));
}

export async function addToCollection(collectionId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('collection_items').insert({ collection_id: collectionId, post_id: postId });
  if (error && error.code !== ALREADY_EXISTS) throw error;
}

export async function removeFromCollection(collectionId: string, postId: string): Promise<void> {
  unwrap(await supabase.from('collection_items').delete().eq('collection_id', collectionId).eq('post_id', postId));
}

/** Which of my collections already contain this post. */
export async function fetchMyCollectionIdsForPost(ownerId: string, postId: string): Promise<string[]> {
  const rows = await fetchRows<{ collection_id: string }>(
    supabase
      .from('collection_items')
      .select('collection_id, collection:collections!inner(owner_id)')
      .eq('post_id', postId)
      .eq('collection.owner_id', ownerId),
  );
  return rows.map((r) => r.collection_id);
}

const LIST_PAGE = 18;

interface JoinRow {
  added_at?: string;
  created_at?: string;
  post_id: string;
  post: PostRow | null;
}

/** Posts joined through collection_items or saved_posts, most recently added first. */
async function fetchJoinedPostsPage(
  table: 'collection_items' | 'saved_posts',
  filter: { column: string; value: string },
  cursor: Cursor | null,
): Promise<Page<Post>> {
  const timeColumn = table === 'collection_items' ? 'added_at' : 'created_at';
  let query = supabase
    .from(table)
    .select(`${timeColumn}, post_id, post:posts(${POST_SELECT})`)
    .eq(filter.column, filter.value)
    .order(timeColumn, { ascending: false })
    .order('post_id', { ascending: false })
    .limit(LIST_PAGE);
  if (cursor) {
    query = query.or(
      `${timeColumn}.lt.${cursor.before},and(${timeColumn}.eq.${cursor.before},post_id.lt.${cursor.beforeId})`,
    );
  }
  const rows = await fetchRows<JoinRow>(query);
  // Posts that are no longer visible (deleted, made private, blocked) come back null.
  const posts = await attachImageUrls(mapPosts(rows.flatMap((r) => (r.post ? [r.post] : []))), 'thumb');
  const last = rows[rows.length - 1];
  const lastTime = last ? (last.added_at ?? last.created_at) : undefined;
  return {
    items: posts,
    nextCursor: rows.length === LIST_PAGE && last && lastTime ? { before: lastTime, beforeId: last.post_id } : null,
  };
}

export function fetchCollectionPostsPage(collectionId: string, cursor: Cursor | null) {
  return fetchJoinedPostsPage('collection_items', { column: 'collection_id', value: collectionId }, cursor);
}

export function fetchSavedPostsPage(userId: string, cursor: Cursor | null) {
  return fetchJoinedPostsPage('saved_posts', { column: 'user_id', value: userId }, cursor);
}
