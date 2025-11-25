import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { env } from "../../config/env";

// Create Supabase client with service role key for server-side operations
export const supabase: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Create a client with anon key for client-facing operations
export const supabaseAnon: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

/**
 * Verify a Supabase JWT token and return the user
 */
export async function verifyToken(token: string): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Get user by ID from Supabase Auth
 */
export async function getUserById(userId: string): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.admin.getUserById(userId);

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Check Supabase connectivity
 */
export async function checkSupabaseHealth(): Promise<{ healthy: boolean; error?: string }> {
  try {
    // Simple health check - list buckets
    const { error } = await supabase.storage.listBuckets();
    if (error) {
      return { healthy: false, error: error.message };
    }
    return { healthy: true };
  } catch (e) {
    return { healthy: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// Storage bucket names
export const STORAGE_BUCKETS = {
  MEMORIES: "memories",
  AVATARS: "avatars",
} as const;

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: { contentType?: string; upsert?: boolean }
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: options?.contentType,
    upsert: options?.upsert ?? false,
  });

  if (error) {
    return { url: null, error: error.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return { url: publicUrl, error: null };
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(bucket: string, path: string): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/**
 * Get a signed URL for private file access
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);

  if (error) {
    return { url: null, error: error.message };
  }

  return { url: data.signedUrl, error: null };
}

