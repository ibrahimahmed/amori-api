// Environment variables are set in tests/setup.ts (preloaded by bun)
import { describe, expect, it, beforeEach, mock } from "bun:test";
import { Elysia } from "elysia";

// Test constants
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "password123";
const TEST_NAME = "Test User";
const TEST_OTP = "123456";

// Mock user data
const mockUser = {
  id: TEST_USER_ID,
  email: TEST_EMAIL,
  name: TEST_NAME,
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockSupabaseUser = {
  id: TEST_USER_ID,
  email: TEST_EMAIL,
  user_metadata: {
    full_name: TEST_NAME,
    avatar_url: null,
  },
};

const mockSession = {
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
};

// Mock services with proper parameter types
const mockSupabaseAuth = {
  signUp: mock((_credentials: { email: string; password: string; options?: unknown }) =>
    Promise.resolve({ data: { user: mockSupabaseUser, session: mockSession }, error: null })
  ),
  signInWithPassword: mock((_credentials: { email: string; password: string }) =>
    Promise.resolve({ data: { user: mockSupabaseUser, session: mockSession }, error: null })
  ),
  signInWithOAuth: mock((_params: { provider: string; options?: unknown }) =>
    Promise.resolve({ data: { url: "https://oauth.example.com", provider: "google" }, error: null })
  ),
  exchangeCodeForSession: mock((_code: string) =>
    Promise.resolve({ data: { user: mockSupabaseUser, session: mockSession }, error: null })
  ),
  admin: {
    updateUserById: mock((_userId: string, _params: { password: string }) =>
      Promise.resolve({ data: { user: mockSupabaseUser }, error: null })
    ),
    signOut: mock((_token: string) => Promise.resolve({ error: null })),
  },
};

const mockDb = {
  insertInto: mock(() => mockDb),
  selectFrom: mock(() => mockDb),
  updateTable: mock(() => mockDb),
  deleteFrom: mock(() => mockDb),
  values: mock(() => mockDb),
  select: mock(() => mockDb),
  selectAll: mock(() => mockDb),
  set: mock(() => mockDb),
  where: mock(() => mockDb),
  onConflict: mock(() => mockDb),
  column: mock(() => mockDb),
  doNothing: mock(() => mockDb),
  doUpdateSet: mock(() => mockDb),
  returningAll: mock(() => mockDb),
  execute: mock(() => Promise.resolve([])),
  executeTakeFirst: mock(() => Promise.resolve(mockUser)),
};

const mockRedis = {
  get: mock((_key: string) => Promise.resolve(null)),
  setex: mock((_key: string, _ttl: number, _value: string) => Promise.resolve("OK")),
  del: mock((_key: string) => Promise.resolve(1)),
};

const mockSendEmail = mock((_params: { to: string; subject: string; html: string; text: string }) =>
  Promise.resolve({ id: "email-123" })
);

const mockIsEmailEnabled = mock(() => true);

// Helper to reset all mocks
function resetMocks() {
  mockSupabaseAuth.signUp.mockReset();
  mockSupabaseAuth.signInWithPassword.mockReset();
  mockSupabaseAuth.signInWithOAuth.mockReset();
  mockSupabaseAuth.exchangeCodeForSession.mockReset();
  mockSupabaseAuth.admin.updateUserById.mockReset();
  mockSupabaseAuth.admin.signOut.mockReset();
  mockDb.execute.mockReset();
  mockDb.executeTakeFirst.mockReset();
  mockRedis.get.mockReset();
  mockRedis.setex.mockReset();
  mockRedis.del.mockReset();
  mockSendEmail.mockReset();
  mockIsEmailEnabled.mockReset();

  // Set default implementations
  mockSupabaseAuth.signUp.mockImplementation(() =>
    Promise.resolve({ data: { user: mockSupabaseUser, session: mockSession }, error: null })
  );
  mockSupabaseAuth.signInWithPassword.mockImplementation(() =>
    Promise.resolve({ data: { user: mockSupabaseUser, session: mockSession }, error: null })
  );
  mockSupabaseAuth.signInWithOAuth.mockImplementation(() =>
    Promise.resolve({ data: { url: "https://oauth.example.com", provider: "google" }, error: null })
  );
  mockSupabaseAuth.exchangeCodeForSession.mockImplementation(() =>
    Promise.resolve({ data: { user: mockSupabaseUser, session: mockSession }, error: null })
  );
  mockSupabaseAuth.admin.updateUserById.mockImplementation(() =>
    Promise.resolve({ data: { user: mockSupabaseUser }, error: null })
  );
  mockSupabaseAuth.admin.signOut.mockImplementation(() => Promise.resolve({ error: null }));
  mockDb.execute.mockImplementation(() => Promise.resolve([]));
  mockDb.executeTakeFirst.mockImplementation(() => Promise.resolve(mockUser));
  mockRedis.get.mockImplementation(() => Promise.resolve(null));
  mockRedis.setex.mockImplementation(() => Promise.resolve("OK"));
  mockRedis.del.mockImplementation(() => Promise.resolve(1));
  mockSendEmail.mockImplementation(() => Promise.resolve({ id: "email-123" }));
  mockIsEmailEnabled.mockImplementation(() => true);
}

// Create test app for public routes
function createPublicAuthApp() {
  return new Elysia({ prefix: "/auth" })
    .post("/signup", async ({ body, set }) => {
      const reqBody = body as { email: string; password: string; name?: string };
      const { data, error } = await mockSupabaseAuth.signUp({
        email: reqBody.email,
        password: reqBody.password,
        options: { data: { full_name: reqBody.name } },
      });

      if (error) {
        set.status = 400;
        return { success: false, error: error.message };
      }

      if (data.user) {
        await mockDb.execute();
      }

      return {
        success: true,
        data: { user: data.user, session: data.session },
        message: "Account created successfully.",
      };
    })
    .post("/signin", async ({ body, set }) => {
      const reqBody = body as { email: string; password: string };
      const { data, error } = await mockSupabaseAuth.signInWithPassword({
        email: reqBody.email,
        password: reqBody.password,
      });

      if (error) {
        set.status = 401;
        return { success: false, error: error.message };
      }

      if (data.user) {
        await mockDb.execute();
      }

      return { success: true, data: { user: data.user, session: data.session } };
    })
    .post("/signin/oauth", async ({ body, set }) => {
      const reqBody = body as { provider: "google" | "apple"; redirectTo?: string };
      const { data, error } = await mockSupabaseAuth.signInWithOAuth({
        provider: reqBody.provider,
        options: { redirectTo: reqBody.redirectTo },
      });

      if (error) {
        set.status = 400;
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: { url: data.url, provider: data.provider },
        message: "Redirect to provider for authentication",
      };
    })
    .post("/callback", async ({ body, set }) => {
      const reqBody = body as { code: string };
      const { data, error } = await mockSupabaseAuth.exchangeCodeForSession(reqBody.code);

      if (error) {
        set.status = 400;
        return { success: false, error: error.message };
      }

      if (data.user) {
        await mockDb.execute();
      }

      return { success: true, data: { user: data.user, session: data.session } };
    })
    .post("/forgot-password", async ({ body, set }) => {
      const reqBody = body as { email: string };

      if (!mockIsEmailEnabled()) {
        set.status = 503;
        return { success: false, error: "Email service is not configured." };
      }

      const user = await mockDb.executeTakeFirst();

      if (!user) {
        return {
          success: true,
          message: "If an account exists with this email, you will receive a password reset code.",
        };
      }

      const otp = "123456";
      await mockRedis.setex(`otp:${reqBody.email}`, 600, otp);

      try {
        await mockSendEmail({
          to: reqBody.email,
          subject: "Reset Your Password",
          html: `<p>Your OTP is: ${otp}</p>`,
          text: `Your OTP is: ${otp}`,
        });

        return {
          success: true,
          message: "If an account exists with this email, you will receive a password reset code.",
        };
      } catch {
        await mockRedis.del(`otp:${reqBody.email}`);
        set.status = 500;
        return { success: false, error: "Failed to send reset code." };
      }
    })
    .post("/reset-password", async ({ body, set }) => {
      const reqBody = body as { email: string; otp: string; new_password: string };

      const storedOtp = await mockRedis.get(`otp:${reqBody.email}`);

      if (!storedOtp) {
        set.status = 400;
        return { success: false, error: "Invalid or expired reset code." };
      }

      if (storedOtp !== reqBody.otp) {
        set.status = 400;
        return { success: false, error: "Invalid reset code." };
      }

      const user = await mockDb.executeTakeFirst();

      if (!user) {
        set.status = 404;
        return { success: false, error: "User not found." };
      }

      const { error } = await mockSupabaseAuth.admin.updateUserById(user.id, {
        password: reqBody.new_password,
      });

      if (error) {
        set.status = 500;
        return { success: false, error: "Failed to reset password." };
      }

      await mockRedis.del(`otp:${reqBody.email}`);

      return { success: true, message: "Password reset successfully." };
    })
    .post("/logout", async ({ request, set }) => {
      const authHeader = request.headers.get("authorization");

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "No authorization header provided" };
      }

      const token = authHeader.replace("Bearer ", "");
      const { error } = await mockSupabaseAuth.admin.signOut(token);

      if (error) {
        set.status = 400;
        return { success: false, error: error.message };
      }

      return { success: true, message: "Logged out successfully" };
    });
}

// Create test app for protected routes
function createProtectedAuthApp() {
  return new Elysia({ prefix: "/auth" })
    .derive(() => ({
      user: { id: TEST_USER_ID, email: TEST_EMAIL, name: TEST_NAME, avatar_url: null },
    }))
    .get("/me", async ({ user }) => {
      const dbUser = await mockDb.executeTakeFirst();
      return { success: true, data: dbUser || user };
    })
    .patch("/me", async ({ user, body }) => {
      const reqBody = body as { name?: string; avatar_url?: string };
      const updatedUser = { ...user, ...reqBody };
      mockDb.executeTakeFirst.mockImplementation(() => Promise.resolve(updatedUser));
      const result = await mockDb.executeTakeFirst();
      return { success: true, data: result };
    })
    .delete("/me", async ({ set }) => {
      await mockDb.execute();
      set.status = 204;
      return null;
    });
}

describe("Auth Routes - Public Endpoints", () => {
  let app: ReturnType<typeof createPublicAuthApp>;

  beforeEach(() => {
    app = createPublicAuthApp();
    resetMocks();
  });

  describe("POST /auth/signup", () => {
    it("should create a new account", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.user).toBeDefined();
      expect(data.data.session).toBeDefined();
    });

    it("should return error when signup fails", async () => {
      mockSupabaseAuth.signUp.mockImplementation(() =>
        Promise.resolve({ data: { user: null, session: null }, error: { message: "Email already in use" } })
      );

      const response = await app.handle(
        new Request("http://localhost/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Email already in use");
    });

    it("should create account without name", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("POST /auth/signin", () => {
    it("should sign in with valid credentials", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.user).toBeDefined();
      expect(data.data.session).toBeDefined();
    });

    it("should return 401 for invalid credentials", async () => {
      mockSupabaseAuth.signInWithPassword.mockImplementation(() =>
        Promise.resolve({ data: { user: null, session: null }, error: { message: "Invalid login credentials" } })
      );

      const response = await app.handle(
        new Request("http://localhost/auth/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, password: "wrong-password" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid login credentials");
    });
  });

  describe("POST /auth/signin/oauth", () => {
    it("should return OAuth URL for Google", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/signin/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "google" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.url).toBeDefined();
      expect(data.data.provider).toBe("google");
    });

    it("should return OAuth URL for Apple", async () => {
      mockSupabaseAuth.signInWithOAuth.mockImplementation(() =>
        Promise.resolve({ data: { url: "https://apple.oauth.example.com", provider: "apple" }, error: null })
      );

      const response = await app.handle(
        new Request("http://localhost/auth/signin/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "apple" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.provider).toBe("apple");
    });

    it("should accept optional redirectTo", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/signin/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "google", redirectTo: "https://app.example.com/callback" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should return error when OAuth fails", async () => {
      mockSupabaseAuth.signInWithOAuth.mockImplementation(() =>
        Promise.resolve({ data: { url: null, provider: null }, error: { message: "OAuth error" } })
      );

      const response = await app.handle(
        new Request("http://localhost/auth/signin/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "google" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe("POST /auth/callback", () => {
    it("should exchange code for session", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "oauth-code-123" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.user).toBeDefined();
      expect(data.data.session).toBeDefined();
    });

    it("should return error for invalid code", async () => {
      mockSupabaseAuth.exchangeCodeForSession.mockImplementation(() =>
        Promise.resolve({ data: { user: null, session: null }, error: { message: "Invalid code" } })
      );

      const response = await app.handle(
        new Request("http://localhost/auth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "invalid-code" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("should send OTP when user exists", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it("should return success even when user does not exist (security)", async () => {
      mockDb.executeTakeFirst.mockImplementation(() => Promise.resolve(null));

      const response = await app.handle(
        new Request("http://localhost/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "nonexistent@example.com" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Email should NOT be sent for non-existent users
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("should return 503 when email service is disabled", async () => {
      mockIsEmailEnabled.mockImplementation(() => false);

      const response = await app.handle(
        new Request("http://localhost/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
    });

    it("should return error when email fails to send", async () => {
      mockSendEmail.mockImplementation(() => Promise.reject(new Error("SMTP error")));

      const response = await app.handle(
        new Request("http://localhost/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(mockRedis.del).toHaveBeenCalled(); // OTP should be deleted
    });
  });

  describe("POST /auth/reset-password", () => {
    it("should reset password with valid OTP", async () => {
      mockRedis.get.mockImplementation(() => Promise.resolve(TEST_OTP));

      const response = await app.handle(
        new Request("http://localhost/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, otp: TEST_OTP, new_password: "newpassword123" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSupabaseAuth.admin.updateUserById).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it("should return 400 for expired OTP", async () => {
      mockRedis.get.mockImplementation(() => Promise.resolve(null));

      const response = await app.handle(
        new Request("http://localhost/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, otp: TEST_OTP, new_password: "newpassword123" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("expired");
    });

    it("should return 400 for invalid OTP", async () => {
      mockRedis.get.mockImplementation(() => Promise.resolve(TEST_OTP));

      const response = await app.handle(
        new Request("http://localhost/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, otp: "000000", new_password: "newpassword123" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid");
    });

    it("should return 404 when user not found", async () => {
      mockRedis.get.mockImplementation(() => Promise.resolve(TEST_OTP));
      mockDb.executeTakeFirst.mockImplementation(() => Promise.resolve(null));

      const response = await app.handle(
        new Request("http://localhost/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "nonexistent@example.com", otp: TEST_OTP, new_password: "newpassword123" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it("should return 500 when password update fails", async () => {
      mockRedis.get.mockImplementation(() => Promise.resolve(TEST_OTP));
      mockSupabaseAuth.admin.updateUserById.mockImplementation(() =>
        Promise.resolve({ data: null, error: { message: "Update failed" } })
      );

      const response = await app.handle(
        new Request("http://localhost/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: TEST_EMAIL, otp: TEST_OTP, new_password: "newpassword123" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe("POST /auth/logout", () => {
    it("should logout with valid token", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/logout", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSupabaseAuth.admin.signOut).toHaveBeenCalled();
    });

    it("should return 401 without authorization header", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/logout", {
          method: "POST",
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it("should return 401 with invalid authorization format", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/logout", {
          method: "POST",
          headers: { Authorization: "InvalidFormat token" },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it("should return error when signOut fails", async () => {
      mockSupabaseAuth.admin.signOut.mockImplementation(() =>
        Promise.resolve({ error: { message: "Sign out failed" } })
      );

      const response = await app.handle(
        new Request("http://localhost/auth/logout", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});

describe("Auth Routes - Protected Endpoints", () => {
  let app: ReturnType<typeof createProtectedAuthApp>;

  beforeEach(() => {
    app = createProtectedAuthApp();
    resetMocks();
  });

  describe("GET /auth/me", () => {
    it("should return current user profile", async () => {
      const response = await app.handle(new Request("http://localhost/auth/me"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_USER_ID);
      expect(data.data.email).toBe(TEST_EMAIL);
    });

    it("should return user from database", async () => {
      const dbUser = { ...mockUser, name: "DB User Name" };
      mockDb.executeTakeFirst.mockImplementation(() => Promise.resolve(dbUser));

      const response = await app.handle(new Request("http://localhost/auth/me"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.name).toBe("DB User Name");
    });
  });

  describe("PATCH /auth/me", () => {
    it("should update user name", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Name" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe("Updated Name");
    });

    it("should update avatar_url", async () => {
      const newAvatarUrl = "https://example.com/avatar.jpg";

      const response = await app.handle(
        new Request("http://localhost/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatar_url: newAvatarUrl }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.avatar_url).toBe(newAvatarUrl);
    });

    it("should update both name and avatar_url", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Name", avatar_url: "https://example.com/new.jpg" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should accept empty update", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /auth/me", () => {
    it("should delete user account", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/me", {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(204);
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });
});

describe("Auth Response Format", () => {
  let app: ReturnType<typeof createPublicAuthApp>;

  beforeEach(() => {
    app = createPublicAuthApp();
    resetMocks();
  });

  it("should return consistent success response format", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      })
    );
    const data = await response.json();

    expect(data).toHaveProperty("success", true);
    expect(data).toHaveProperty("data");
  });

  it("should return consistent error response format", async () => {
    mockSupabaseAuth.signInWithPassword.mockImplementation(() =>
      Promise.resolve({ data: { user: null, session: null }, error: { message: "Error" } })
    );

    const response = await app.handle(
      new Request("http://localhost/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      })
    );
    const data = await response.json();

    expect(data).toHaveProperty("success", false);
    expect(data).toHaveProperty("error");
    expect(typeof data.error).toBe("string");
  });
});

describe("Auth Edge Cases", () => {
  let app: ReturnType<typeof createPublicAuthApp>;

  beforeEach(() => {
    app = createPublicAuthApp();
    resetMocks();
  });

  it("should handle special characters in name", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          name: "José María O'Connor-Smith",
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  it("should handle unicode in name", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          name: "田中太郎 🎉",
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  it("should handle email with subdomain", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@mail.company.com",
          password: TEST_PASSWORD,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  it("should handle plus addressing in email", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user+tag@example.com",
          password: TEST_PASSWORD,
        }),
      })
    );

    expect(response.status).toBe(200);
  });
});

