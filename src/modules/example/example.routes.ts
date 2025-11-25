import { Elysia, t } from 'elysia';
import { exampleController } from './example.controller';
import { EchoRequest } from './example.types';
import { authContext } from '../../middlewares/authContext';

export const exampleRoutes = new Elysia({ prefix: '/example' })
  .get('/', async () => {
    return await exampleController.getHello();
  }, {
    detail: {
      tags: ['example'],
      summary: 'Get hello message',
      description: 'Returns a hello message from the example service',
    },
  })
  .post('/echo', async ({ body }) => {
    return await exampleController.echo({ body });
  }, {
    body: t.Object({
      message: t.String(),
    }, { additionalProperties: true }),
    detail: {
      tags: ['example'],
      summary: 'Echo endpoint',
      description: 'Echos back the posted data',
    },
  })
  // --- Protected route example ---
  .use(authContext)
  .get('/protected', async (ctx: { user: any }) => {
    return {
      message: 'You are authenticated!',
      user: ctx.user,
    };
  }, {
    detail: {
      tags: ['example'],
      summary: 'Protected route',
      description: 'Requires authentication. Returns the authenticated user info.',
    },
  });
  