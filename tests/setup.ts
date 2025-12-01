// Test setup - sets environment variables before any test imports
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.OPENAI_API_KEY = "sk-test-key";
process.env.RESEND_API_KEY = "re_test-key";
process.env.SUPPORT_EMAIL = "test-support@amori.app";

import { mock } from "bun:test";

// Global mock for Supabase client to prevent real client creation
const mockSupabaseClient = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    admin: { getUserById: () => Promise.resolve({ data: { user: null }, error: null }) },
    signOut: () => Promise.resolve({ error: null }),
  },
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: { path: "test" }, error: null }),
      remove: () => Promise.resolve({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "https://example.com/file.jpg" } }),
      createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://example.com/signed" }, error: null }),
    }),
    listBuckets: () => Promise.resolve({ error: null }),
  },
};

mock.module("../src/libs/supabase/client", () => ({
  supabase: mockSupabaseClient,
  supabaseAnon: mockSupabaseClient,
  verifyToken: () => Promise.resolve(null),
  getUserById: () => Promise.resolve(null),
  checkSupabaseHealth: () => Promise.resolve({ healthy: true }),
  uploadFile: () => Promise.resolve({ url: "https://example.com/file.jpg", error: null }),
  deleteFile: () => Promise.resolve({ success: true, error: null }),
  getSignedUrl: () => Promise.resolve({ url: "https://example.com/signed", error: null }),
  STORAGE_BUCKETS: { MEMORIES: "memories", AVATARS: "avatars" },
}));

export {};

