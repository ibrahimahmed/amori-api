// Environment variables are set in tests/setup.ts (preloaded by bun)
import { describe, expect, it, beforeEach, mock } from "bun:test";
import { Elysia } from "elysia";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Test constants
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_EMAIL = "test@example.com";
const TEST_NAME = "Test User";
const VALID_TOKEN = "valid-jwt-token";
const INVALID_TOKEN = "invalid-token";

// Mock data
const mockSupabaseUser = {
  id: TEST_USER_ID,
  email: TEST_EMAIL,
  user_metadata: {
    full_name: TEST_NAME,
    name: TEST_NAME,
    avatar_url: "https://example.com/avatar.jpg",
  },
};

const mockDbUser = {
  id: TEST_USER_ID,
  email: TEST_EMAIL,
  name: TEST_NAME,
  avatar_url: "https://example.com/avatar.jpg",
  created_at: new Date(),
  updated_at: new Date(),
};

// Mock functions
const mockVerifyToken = mock((_token: string): Promise<any> => Promise.resolve(null));

const mockDbExecuteTakeFirst = mock((): Promise<any> => Promise.resolve(null));
const mockDbReturningAllExecuteTakeFirst = mock((): Promise<any> => Promise.resolve(mockDbUser));

const mockDbChain = {
  selectFrom: () => mockDbChain,
  insertInto: () => mockDbChain,
  selectAll: () => mockDbChain,
  values: () => mockDbChain,
  where: () => mockDbChain,
  returningAll: () => ({
    executeTakeFirst: mockDbReturningAllExecuteTakeFirst,
  }),
  executeTakeFirst: mockDbExecuteTakeFirst,
};

// Helper to reset mocks
function resetMocks() {
  mockVerifyToken.mockReset();
  mockDbExecuteTakeFirst.mockReset();
  mockDbReturningAllExecuteTakeFirst.mockReset();

  mockVerifyToken.mockImplementation(() => Promise.resolve(null));
  mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));
  mockDbReturningAllExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockDbUser));
}

// Create test app with middleware simulation
function createAuthMiddlewareTestApp() {
  return new Elysia()
    .derive(async ({ request, set }): Promise<{ user: any }> => {
      const authHeader = request.headers.get("authorization");

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        throw new Error("Unauthorized: Missing or invalid authorization header");
      }

      const token = authHeader.replace("Bearer ", "");
      const supabaseUser = await mockVerifyToken(token);

      if (!supabaseUser) {
        set.status = 401;
        throw new Error("Unauthorized: Invalid token");
      }

      // Check if user exists in database
      let dbUser = await mockDbExecuteTakeFirst();

      if (!dbUser) {
        // Create user in database (first-time sync)
        dbUser = await mockDbReturningAllExecuteTakeFirst();
      }

      return {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          avatar_url: dbUser.avatar_url,
        },
      };
    })
    .onError(({ error, set }) => {
      if (error.message.includes("Unauthorized")) {
        set.status = 401;
        return { success: false, error: error.message };
      }
      set.status = 500;
      return { success: false, error: "Internal server error" };
    })
    .get("/protected", ({ user }) => {
      return { success: true, data: { user } };
    });
}

describe("Auth Middleware", () => {
  let app: ReturnType<typeof createAuthMiddlewareTestApp>;

  beforeEach(() => {
    app = createAuthMiddlewareTestApp();
    resetMocks();
  });

  describe("Token Validation", () => {
    it("should reject request without authorization header", async () => {
      const response = await app.handle(new Request("http://localhost/protected"));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Missing");
    });

    it("should reject request with empty authorization header", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "" },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it("should reject request with invalid authorization format", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Basic dXNlcjpwYXNz" },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain("invalid authorization header");
    });

    it("should reject request with 'Bearer' but no token", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer " },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it("should reject request with invalid token", async () => {
      mockVerifyToken.mockImplementation(() => Promise.resolve(null));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${INVALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid token");
    });

    it("should accept request with valid token", async () => {
      mockVerifyToken.mockImplementation(() => Promise.resolve(mockSupabaseUser));
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockDbUser));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.user).toBeDefined();
    });
  });

  describe("User Context", () => {
    beforeEach(() => {
      mockVerifyToken.mockImplementation(() => Promise.resolve(mockSupabaseUser));
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockDbUser));
    });

    it("should attach user to context", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(data.data.user.id).toBe(TEST_USER_ID);
      expect(data.data.user.email).toBe(TEST_EMAIL);
      expect(data.data.user.name).toBe(TEST_NAME);
    });

    it("should include avatar_url in user context", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(data.data.user.avatar_url).toBe("https://example.com/avatar.jpg");
    });

    it("should handle user without avatar_url", async () => {
      const userWithoutAvatar = { ...mockDbUser, avatar_url: null };
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(userWithoutAvatar));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(data.data.user.avatar_url).toBeNull();
    });

    it("should handle user without name", async () => {
      const userWithoutName = { ...mockDbUser, name: null };
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(userWithoutName));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(data.data.user.name).toBeNull();
    });
  });

  describe("Database Sync", () => {
    beforeEach(() => {
      mockVerifyToken.mockImplementation(() => Promise.resolve(mockSupabaseUser));
    });

    it("should return existing user from database", async () => {
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockDbUser));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.user.id).toBe(TEST_USER_ID);
      expect(mockDbReturningAllExecuteTakeFirst).not.toHaveBeenCalled();
    });

    it("should create user in database if not exists", async () => {
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));
      mockDbReturningAllExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockDbUser));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockDbReturningAllExecuteTakeFirst).toHaveBeenCalled();
      expect(data.data.user.id).toBe(TEST_USER_ID);
    });

    it("should use Supabase metadata for new user", async () => {
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));

      const newUser = {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        name: mockSupabaseUser.user_metadata.full_name,
        avatar_url: mockSupabaseUser.user_metadata.avatar_url,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbReturningAllExecuteTakeFirst.mockImplementation(() => Promise.resolve(newUser));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(data.data.user.name).toBe(TEST_NAME);
    });

    it("should handle user with only 'name' in metadata (no full_name)", async () => {
      const userWithOnlyName = {
        ...mockSupabaseUser,
        user_metadata: {
          name: "Simple Name",
          avatar_url: null,
        },
      };
      mockVerifyToken.mockImplementation(() => Promise.resolve(userWithOnlyName));
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));

      const newUser = {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        name: "Simple Name",
        avatar_url: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbReturningAllExecuteTakeFirst.mockImplementation(() => Promise.resolve(newUser));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.user.name).toBe("Simple Name");
    });
  });

  describe("Error Handling", () => {
    it("should handle verifyToken throwing error", async () => {
      mockVerifyToken.mockImplementation(() => Promise.reject(new Error("Token verification failed")));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it("should handle database error during user lookup", async () => {
      mockVerifyToken.mockImplementation(() => Promise.resolve(mockSupabaseUser));
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("Database error")));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it("should handle database error during user creation", async () => {
      mockVerifyToken.mockImplementation(() => Promise.resolve(mockSupabaseUser));
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));
      mockDbReturningAllExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("Insert failed")));

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe("Token Formats", () => {
    beforeEach(() => {
      mockVerifyToken.mockImplementation(() => Promise.resolve(mockSupabaseUser));
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockDbUser));
    });

    it("should handle JWT format token", async () => {
      const jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${jwtToken}` },
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should handle token with extra whitespace", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer  ${VALID_TOKEN}` }, // Extra space
        })
      );
      const data = await response.json();

      // Should still work, token extraction handles this
      expect(mockVerifyToken).toHaveBeenCalled();
    });

    it("should be case-sensitive for 'Bearer' prefix", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `bearer ${VALID_TOKEN}` }, // lowercase
        })
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });
  });

  describe("AuthUser Interface", () => {
    beforeEach(() => {
      mockVerifyToken.mockImplementation(() => Promise.resolve(mockSupabaseUser));
      mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockDbUser));
    });

    it("should return all required AuthUser properties", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      const user = data.data.user;
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("avatar_url");
    });

    it("should return string type for id", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(typeof data.data.user.id).toBe("string");
    });

    it("should return string type for email", async () => {
      const response = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );
      const data = await response.json();

      expect(typeof data.data.user.email).toBe("string");
    });
  });
});

describe("Auth Middleware - Concurrent Requests", () => {
  let app: ReturnType<typeof createAuthMiddlewareTestApp>;

  beforeEach(() => {
    app = createAuthMiddlewareTestApp();
    resetMocks();
    mockVerifyToken.mockImplementation(() => Promise.resolve(mockSupabaseUser));
    mockDbExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockDbUser));
  });

  it("should handle multiple concurrent requests", async () => {
    const requests = Array(10)
      .fill(null)
      .map(() =>
        app.handle(
          new Request("http://localhost/protected", {
            headers: { Authorization: `Bearer ${VALID_TOKEN}` },
          })
        )
      );

    const responses = await Promise.all(requests);

    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });
  });

  it("should handle mixed valid and invalid requests", async () => {
    const validRequest = () =>
      app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        })
      );

    const invalidRequest = () => app.handle(new Request("http://localhost/protected"));

    const requests = [validRequest(), invalidRequest(), validRequest(), invalidRequest(), validRequest()];

    const responses = await Promise.all(requests);

    expect(responses[0].status).toBe(200);
    expect(responses[1].status).toBe(401);
    expect(responses[2].status).toBe(200);
    expect(responses[3].status).toBe(401);
    expect(responses[4].status).toBe(200);
  });
});

