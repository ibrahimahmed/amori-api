# Amori API - Architecture

## Overview

Amori API is a module-based backend service for relationship and memory management. It's built with modern TypeScript tools optimized for performance and developer experience.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Elysia.js
- **Database**: PostgreSQL via Kysely
- **Cache**: Redis (ioredis)
- **Auth & Storage**: Supabase
- **AI**: OpenAI GPT-4
- **Deployment**: Railway

## Directory Structure

```
src/
├── config/              # Configuration management
│   ├── env.ts           # Environment validation with Zod
│   └── index.ts
├── db/
│   └── schema.sql       # Database schema
├── libs/                # Shared libraries
│   ├── cache/           # Redis client
│   ├── db/              # Kysely setup & schema types
│   ├── email/           # Resend email (optional)
│   ├── openai/          # OpenAI with caching
│   └── supabase/        # Supabase client
├── middlewares/         # Elysia middleware
│   ├── authContext.ts   # Auth re-export
│   ├── cors.ts          # CORS configuration
│   ├── errorHandler.ts  # Error handling
│   └── metrics.ts       # Request metrics
├── modules/             # Feature modules
│   ├── ai/              # AI features
│   ├── auth/            # Authentication
│   ├── health/          # Health checks
│   ├── memories/        # Memory management
│   ├── people/          # Relationship management
│   ├── planner/         # Event planning
│   └── wishlist/        # Wishlist management
└── index.ts             # Application entry
```

## Module Structure

Each module follows a consistent pattern:

```
module/
├── module.service.ts    # Business logic
├── module.routes.ts     # HTTP route handlers
└── index.ts             # Module exports
```

## Data Flow

```
Request
    │
    ▼
┌─────────────────┐
│   Middleware    │  (CORS, Auth, Metrics, Error Handler)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Routes      │  (Request validation, response formatting)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Service      │  (Business logic)
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│  DB   │ │ Redis │
└───────┘ └───────┘
```

## Database Schema

### Tables

1. **users** - Synced from Supabase Auth
   - id (UUID, PK)
   - email, name, avatar_url
   - created_at, updated_at

2. **people** - Relationships
   - id (UUID, PK)
   - user_id (FK → users)
   - name, relation_type
   - birthday, anniversary
   - notes, avatar_url, phone, email

3. **memories** - Memories with media
   - id (UUID, PK)
   - user_id (FK → users)
   - person_id (FK → people, nullable)
   - title, description, date
   - media_urls[], tags[]
   - is_favorite

4. **wishlist** - Gift ideas
   - id (UUID, PK)
   - user_id, person_id
   - title, description, price_range
   - url, image_url, priority
   - purchased, purchased_at

5. **planner** - Events & reminders
   - id (UUID, PK)
   - user_id, person_id
   - event_type, title, date
   - reminder_at, completed

## Authentication

Authentication uses Supabase JWT tokens:

1. Client authenticates with Supabase (email, OAuth)
2. Client sends JWT in `Authorization: Bearer <token>`
3. Backend validates token with Supabase
4. User is synced to local database on first request

## AI Integration

OpenAI integration with Redis caching:

- Gift suggestions
- Relationship advice
- Memory prompts
- Activity ideas
- Personalized messages

Responses are cached for 1 hour to reduce API costs.

## Key Design Decisions

1. **Kysely over Prisma**: Type-safe SQL with better performance and smaller bundle
2. **Supabase for Auth/Storage**: Managed service reduces operational complexity
3. **Redis caching for AI**: Reduces OpenAI API costs and improves response times
4. **Module-based structure**: Each feature is self-contained and testable

## Adding a New Module

1. Create directory: `src/modules/feature/`
2. Add service file with business logic
3. Add routes file with Elysia handlers
4. Add index.ts exporting routes
5. Register in `src/index.ts`

## Environment Configuration

All environment variables are validated at startup using Zod. Missing required variables cause immediate failure with clear error messages.

## Error Handling

Errors are handled at the middleware level:
- Validation errors return 400
- Auth errors return 401
- Not found errors return 404
- Server errors return 500 with sanitized messages in production

## Health Checks

Three endpoints for different use cases:
- `/health` - Full status with all service checks
- `/health/live` - Simple liveness (always returns 200)
- `/health/ready` - Readiness (checks DB and Redis)
