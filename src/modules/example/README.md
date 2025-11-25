# Example Module (`/modules/example`)

This module demonstrates how to use all core libraries in the microservice template:

- Logger (`@/libs/logger`)
- Email (`@/libs/email`)
- SMS (`@/libs/sms`)
- HTTP client (`@/libs/http`)
- Kafka (`@/libs/kafka`)
- Database (`@/libs/db/client`)
- Redis cache (`@/libs/cache`)

## Endpoints
- `GET /example` — Calls all core libs and returns a hello message
- `POST /example/echo` — Echos back your posted data and produces a Kafka event

## Usage
- Use this module as a reference for building your own modules.
- Copy this folder, rename it, and update the service/controller/routes for your feature.
- All code is type-safe and ready for production.

## Example Service Usage
```ts
import { exampleService } from './example.service';

await exampleService.getHello();
await exampleService.echo({ message: 'hi' });
```

---
MIT License 