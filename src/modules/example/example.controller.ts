import { exampleService } from './example.service';
import { EchoRequest, EchoResponse, HelloResponse } from './example.types';

export class ExampleController {
  async getHello(): Promise<HelloResponse> {
    return await exampleService.getHello();
  }

  async echo({ body }: { body: EchoRequest }): Promise<EchoResponse> {
    return await exampleService.echo(body);
  }
}

export const exampleController = new ExampleController();
