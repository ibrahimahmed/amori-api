import { logger } from '../../libs/logger';
import { sendEmail } from '../../libs/email';
// import { sendSMS } from '../../libs/sms';

import { kafka } from '../../libs/kafka';
import { db } from '../../libs/db/client';
import { redis } from '../../libs/cache';
import { EchoRequest, EchoResponse, HelloResponse } from './example.types';

export class ExampleService {
  async getHello(): Promise<HelloResponse> {
    logger.info('Hello endpoint called');
    await sendEmail({ to: 'test@example.com', subject: 'Hello', text: 'Hello from the service!' });
    // await sendSMS({ to: '+1234567890', message: 'Hello from the service!' });
    await kafka.publish('example', 'Hello event');
    await redis.setex('example:hello', 60, 'Hello from the service!');
    await db.selectFrom('user').selectAll().limit(1).execute();
    // Example HTTP call (stub)
    // await httpGet('https://jsonplaceholder.typicode.com/todos/1');
    return { message: 'Hello from the example service!' };
  }

  async echo(data: EchoRequest): Promise<EchoResponse> {
    logger.info('Echo endpoint called');
    await kafka.publish('example', JSON.stringify(data));
    return { youSent: data };
  }
}

export const exampleService = new ExampleService();
