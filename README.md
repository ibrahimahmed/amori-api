# Bun + ElysiaJS Microservice Template

A modern, production-ready template for building scalable microservices with [Bun](https://bun.sh/) and [ElysiaJS](https://elysiajs.com/). This template is designed for rapid development, easy onboarding, and long-term maintainability.

---

## 🚀 Quickstart (TL;DR)

```sh
# 1. Clone this repo
npx degit etera-ai/bun-elysia-template my-microservice
cd my-microservice

# 2. Install dependencies
bun install

# 3. Generate your .env file
bun run scripts/setup-env.js

# 4. Start all services (Postgres, Redis, Kafka, etc.)
./scripts/dev.sh

# 5. Start the dev server (hot reload)
bun run dev
```

- API: [http://localhost:3000](http://localhost:3000)
- Swagger Docs: [http://localhost:3000/swagger](http://localhost:3000/swagger)
- Health: [http://localhost:3000/health](http://localhost:3000/health)

---

## 🏗️ Architecture & Folder Structure

```
src/
  modules/         # Feature modules (each feature = 1 folder)
    example/         # Example feature (copy this for new features)
    health/          # Health check endpoints
  libs/            # Shared libraries (db, cache, email, sms, kafka, logger, etc.)
  middlewares/     # ElysiaJS middlewares (auth, error, metrics, etc.)
  config/          # App configuration
  utils/           # Utilities/helpers
  index.ts         # App entry point
scripts/           # Dev & setup scripts
.env.example       # Example env vars
README.md          # This file
```

**Key Principles:**
- Each feature = its own module (service, controller, routes, types, index)
- All shared logic goes in `/libs` (never duplicate code)
- Middlewares are reusable and composable
- Configuration is centralized in `/config`

---

## 🔐 Environment & Secrets

- Copy `.env.example` to `.env` and fill in values, or run `bun run scripts/setup-env.js` to generate one.
- **Never commit secrets to git!**
- Required variables:
  - `PORT`, `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`
  - Optional: `RESEND_API_KEY`, `TWILIO_*`, `GOOGLE_CLIENT_ID`, etc.

---

## 📋 Standard Operating Procedures (SOPs)

### 1. Adding a New Feature Module
1. Copy `src/modules/example/` to `src/modules/your-feature/`
2. Rename files and update logic for your feature
3. Export your routes in `src/modules/your-feature/index.ts`
4. Register your routes in `src/index.ts`:
   ```ts
   import { yourFeatureRoutes } from './modules/your-feature';
   app.use(yourFeatureRoutes);
   ```

### 2. Using Shared Libraries
- Import from `/libs` for DB, cache, email, SMS, Kafka, logger, etc.
- Example:
  ```ts
  import { db } from '@/libs/db/client';
  import { redis } from '@/libs/cache';
  import { sendEmail } from '@/libs/email';
  import { kafka } from '@/libs/kafka';
  import { logger } from '@/libs/logger';
  ```
- **Never duplicate logic**—extend or add to `/libs` if you need new shared functionality.

### 3. Middleware Usage
- Place custom middlewares in `/middlewares`
- Use `.use()` to add them to the app or to specific routes
- Example: `app.use(authContext)`

### 4. Configuration Management
- All config lives in `/config` (e.g., `env.ts`)
- Use Zod for schema validation
- Never hardcode secrets or env vars in code

### 5. Testing
- Place tests in `/tests` (mirroring your module structure)
- Use `bun test` to run all tests
- Example test: `tests/routes/health.test.ts`

### 6. Deployment
- Use Docker Compose for local dev (`./scripts/dev.sh`)
- Use the provided `Dockerfile` for production builds
- Health checks and metrics are built-in for easy ops integration

---

## 🧑‍💻 Example: Add a New Module

1. **Copy the example module:**
   ```sh
   cp -r src/modules/example src/modules/user
   ```
2. **Rename files and update logic:**
   - `example.service.ts` → `user.service.ts`
   - `example.controller.ts` → `user.controller.ts`
   - `example.routes.ts` → `user.routes.ts`
   - Update all class and function names
3. **Export your routes in `src/modules/user/index.ts`:**
   ```ts
   export { userRoutes } from './user.routes';
   ```
4. **Register your module in `src/index.ts`:**
   ```ts
   import { userRoutes } from './modules/user';
   app.use(userRoutes);
   ```
5. **Add tests in `tests/routes/user.test.ts`**

---

## 💡 Best Practices
- Keep controllers and routes thin—put business logic in services
- Use TypeScript types everywhere
- Use the naming utility in `/libs/kafka/naming.ts` for all Kafka topics/groups
- Use the logger for all logs (not `console.log`)
- Add new shared logic to `/libs` for reusability
- Write tests for every new module
- Document your endpoints with Swagger (see example routes)

---

## 🛠️ Troubleshooting & FAQ
- **Kafka stuck in a loop?** See the `docker-compose.yml` comments for correct env vars
- **.env not working?** Regenerate with `bun run scripts/setup-env.js`
- **Database connection errors?** Check your `DATABASE_URL` and that Postgres is running
- **Need to reset everything?** Run `docker-compose down -v` to clear all volumes

---

## 🙏 Credits & License
- Inspired by the best of Bun, ElysiaJS, and modern microservice practices
- MIT License — Use, fork, and contribute! 
