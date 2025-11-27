# Amori API

A production-ready backend API for **Amori** - a relationship and memory management app.

Built with **Bun**, **Elysia.js**, **Kysely**, **Supabase**, **Redis**, and **OpenAI**.

## Features

- **Authentication**: Supabase Auth integration (Email, Google, Apple)
- **People Management**: Track relationships with birthdays, anniversaries, and notes
- **Memories**: Store and organize memories with media uploads via Supabase Storage
- **Wishlist**: Manage gift ideas for people you care about
- **Planner**: Plan events, dates, and set reminders
- **AI-Powered**: Gift suggestions, relationship advice, and personalized messages via OpenAI

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/amori-api.git
cd amori-api

# 2. Install dependencies
bun install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Start local services (PostgreSQL & Redis)
docker-compose up -d

# 5. Run database migrations
# Execute src/db/schema.sql in your PostgreSQL database

# 6. Start the development server
bun run dev
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Welcome message and API info |
| `GET /health` | Health check with service status |
| `GET /swagger` | API documentation |
| **Auth** | |
| `GET /auth/me` | Get current user profile |
| `PATCH /auth/me` | Update user profile |
| `DELETE /auth/me` | Delete account |
| **People** | |
| `GET /people` | List all relationships |
| `GET /people/upcoming` | Upcoming events (birthdays, anniversaries, memories, plans) |
| `POST /people` | Add a new person |
| `GET /people/:id` | Get full person profile with memories, plans, wishlist |
| `PATCH /people/:id` | Update person |
| `DELETE /people/:id` | Delete person (cascades to related data) |
| **Memories** | |
| `GET /memories` | List memories |
| `POST /memories` | Create memory |
| `GET /memories/:id` | Get memory |
| `PATCH /memories/:id` | Update memory |
| `DELETE /memories/:id` | Delete memory |
| `POST /memories/:id/media` | Upload media |
| `POST /memories/:id/favorite` | Toggle favorite |
| **Wishlist** | |
| `GET /wishlist` | List wishlist items |
| `POST /wishlist` | Add item |
| `PATCH /wishlist/:id` | Update item |
| `DELETE /wishlist/:id` | Delete item |
| `POST /wishlist/:id/purchase` | Mark purchased |
| **Planner** | |
| `GET /planner` | List events |
| `POST /planner` | Create event |
| `GET /planner/upcoming` | Upcoming events |
| `GET /planner/calendar/:year/:month` | Calendar view |
| `POST /planner/:id/complete` | Mark completed |
| **AI** | |
| `POST /ai/gifts` | Get gift suggestions |
| `POST /ai/advice` | Get relationship advice |
| `POST /ai/memory-prompts` | Get memory prompts |
| `POST /ai/activities` | Get activity ideas |
| `POST /ai/message` | Generate message |

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/amori

# Redis
REDIS_URL=redis://localhost:6379

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=sk-your-api-key

# Optional
RESEND_API_KEY=re_your_resend_key
```

## Project Structure

```
src/
├── config/         # Environment configuration
├── db/             # Database schema SQL
├── libs/           # Shared libraries
│   ├── cache/      # Redis client
│   ├── db/         # Kysely database client & schema
│   ├── openai/     # OpenAI integration
│   └── supabase/   # Supabase client
├── middlewares/    # Elysia middlewares
├── modules/        # Feature modules
│   ├── ai/         # AI-powered features
│   ├── auth/       # Authentication
│   ├── health/     # Health checks
│   ├── memories/   # Memory management
│   ├── people/     # Relationship management
│   ├── planner/    # Event planning
│   └── wishlist/   # Gift wishlist
└── index.ts        # Application entry
```

## Development

```bash
# Run development server with hot reload
bun run dev

# Type check
bun run typecheck

# Format code
bun run format
```

## Testing

The project uses **Bun's built-in test runner** with comprehensive mocking for all external dependencies.

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/modules/people/people.service.test.ts

# Run tests in a directory
bun test tests/modules/people

# Run tests with timeout
bun test --timeout 30000

# Run tests in watch mode
bun test --watch
```

### Test Structure

```
tests/
├── setup.ts                           # Test environment setup (preloaded)
├── routes/
│   └── health.test.ts                 # Health endpoint tests
└── modules/
    └── [feature]/
        ├── [feature].routes.test.ts   # Route/controller tests
        └── [feature].service.test.ts  # Service/business logic tests
```

### Test Configuration

Tests are configured via `bunfig.toml`:

```toml
[test]
preload = ["./tests/setup.ts"]
```

The `tests/setup.ts` file sets required environment variables before any tests run:

```typescript
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
// ... other env vars
```

### Mocking Strategy

Tests use **complete mocking** - no actual database or Redis connections:

**Route Tests** - Mock the service layer:
```typescript
const mockPeopleService = {
  getAll: mock((_userId: string) => Promise.resolve([mockPerson])),
  create: mock((_data: Record<string, unknown>) => Promise.resolve(mockPerson)),
};
```

**Service Tests** - Mock database and cache:
```typescript
// Mock Redis
const mockRedisGet = mock((): Promise<any> => Promise.resolve(null));
const mockRedisSetex = mock((): Promise<any> => Promise.resolve("OK"));

// Mock Kysely database chain
const mockExecute = mock((): Promise<any> => Promise.resolve([]));
const mockExecuteTakeFirst = mock((): Promise<any> => Promise.resolve(null));
```

### Test Patterns

**AAA Pattern (Arrange-Act-Assert):**
```typescript
it("should return person when found", async () => {
  // Arrange
  mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockPerson));
  
  // Act
  const result = await service.getById(TEST_USER_ID, TEST_PERSON_ID);
  
  // Assert
  expect(result).toEqual(mockPerson);
});
```

**Testing Elysia Routes:**
```typescript
// Create test app with mocked dependencies
function createTestApp() {
  return new Elysia({ prefix: "/people" })
    .derive(() => ({
      user: { id: TEST_USER_ID, email: "test@example.com" },
    }))
    .get("/", async ({ user }) => {
      const people = await mockPeopleService.getAll(user.id);
      return { success: true, data: people };
    });
}

// Test using app.handle()
it("should return all people", async () => {
  const response = await app.handle(new Request("http://localhost/people"));
  const data = await response.json();
  
  expect(response.status).toBe(200);
  expect(data.success).toBe(true);
});
```

### Test Coverage

Current test coverage includes:
- **107 total tests** across 3 test files
- **Route tests**: Input validation, error handling, response formats
- **Service tests**: CRUD operations, caching, error scenarios
- **Edge cases**: Unicode, special characters, date boundaries, concurrent requests

## Deployment

### Railway

1. Connect your GitHub repository to Railway
2. Add environment variables in Railway dashboard
3. Deploy! Railway will auto-detect the Dockerfile

Or use the GitHub Action:

1. Add `RAILWAY_TOKEN` to your repository secrets
2. Push to `main` branch to trigger deployment

### Docker

```bash
# Build image
docker build -t amori-api .

# Run container
docker run -p 3000:3000 --env-file .env amori-api
```

## Database Migrations

The project uses a migration system to manage database schema changes.

### Running Migrations

```bash
# Run all pending migrations
bun run migrate
```

### Migration Files

Migration files are located in `scripts/migrations/` and are applied in alphabetical order.

```
scripts/migrations/
├── 001-intialize.sql    # Initial schema (users, people, memories, etc.)
└── 002-*.sql            # Add more migrations as needed
```

### Creating a New Migration

1. Create a new `.sql` file in `scripts/migrations/`
2. Name it with a number prefix for ordering (e.g., `002-add-feature.sql`)
3. Run `bun run migrate` to apply it

The system tracks applied migrations in a `_migrations` table to prevent re-running.

### CI/CD

Migrations run automatically before deployment in the GitHub Actions workflow.

## License

MIT
