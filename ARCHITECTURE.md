# Bun + ElysiaJS Microservice Template - Architecture

## 🏗️ Module-Based Architecture

This template uses a **module-based architecture** where each feature is organized into self-contained modules. This makes it easy to add, remove, or modify features for any microservice.

## 📁 Directory Structure
```
src/
├── modules/
│   ├── example/         # Example feature module
│   └── health/          # Health check module
├── middlewares/         # ElysiaJS middleware
├── config/              # Configuration
├── utils/               # Utilities
└── index.ts             # Application entry point
```

## 🔄 Data Flow
```
Request → Route → Controller → Service → (DB/Cache/External)
   ↑                                    ↓
Response ← Controller ← Service ← (DB/Cache/External)
```

## 📦 Module Structure
Each module follows this pattern:
- `example.service.ts` - Business logic
- `example.controller.ts` - Route handlers
- `example.routes.ts` - Route definitions
- `index.ts` - Module exports

## 🚀 Benefits
- Separation of concerns
- Testability
- Maintainability
- Reusability
- Scalability

## 🔧 Adding New Modules
1. Create a directory: `src/modules/feature/`
2. Add service, controller, routes, and index files
3. Import and use your module in `src/index.ts`

## 📚 Best Practices
- Keep routes and controllers thin
- Put business logic in services
- Use dependency injection if needed
- Follow naming conventions
- Export from index.ts for clean imports

---
This template is designed to be the starting point for any Bun + ElysiaJS microservice. 