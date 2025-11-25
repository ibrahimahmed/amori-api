// Example MCP (Microservice Communication Pattern) for the example module
// This is a placeholder for message/event-based communication (e.g., pub/sub, RPC)

export interface ExampleEvent {
  type: 'EXAMPLE_EVENT';
  payload: {
    message: string;
  };
}

export function handleExampleEvent(event: ExampleEvent) {
  // Handle the event (stub)
  console.log('Received ExampleEvent:', event.payload.message);
}
