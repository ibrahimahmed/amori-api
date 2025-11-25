import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { env } from './config/env';
import { corsMiddleware } from './middlewares/cors';
import { errorHandler } from './middlewares/errorHandler';
import { metricsMiddleware } from './middlewares/metrics';
import { healthRoutes } from './modules/health';
import { exampleRoutes } from './modules/example';

const app = new Elysia()
  .use(corsMiddleware)
  .use(metricsMiddleware)
  .use(errorHandler)
  .use(swagger({
    documentation: {
      info: {
        title: 'Microservice Template API',
        version: '1.0.0',
        description: 'Reusable Bun + ElysiaJS microservice template',
      },
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'example', description: 'Example endpoints' },
      ],
    },
  }))
  .use(healthRoutes)
  .use(exampleRoutes)
  .get('/', () => ({
    message: 'Microservice Template',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    note: 'Clone this repo and add your own modules!'
  }))
  .listen(env.PORT || 3000, () => {
    console.log(`🚀 Server running at http://localhost:${env.PORT || 3000}`);
    console.log(`📚 Swagger docs at http://localhost:${env.PORT || 3000}/swagger`);
    console.log(`💚 Health check at http://localhost:${env.PORT || 3000}/health`);
  });

export type App = typeof app;
