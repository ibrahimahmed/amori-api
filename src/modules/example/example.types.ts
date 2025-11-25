// Example types for the example module

export interface EchoRequest {
  message: string;
  [key: string]: any;
}

export interface EchoResponse {
  youSent: any;
}

export interface HelloResponse {
  message: string;
}
