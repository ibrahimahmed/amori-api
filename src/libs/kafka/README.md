# Kafka Library (`@/libs/kafka`)

A developer-friendly Kafka library for Bun/ElysiaJS microservices, built on [kafkajs](https://kafka.js.org/). Supports common messaging patterns:

- **Pub/Sub** (event broadcasting)
- **Request/Reply** (RPC over Kafka)
- **Stream Processing** (consumer groups)
- **CDC (Change Data Capture)**
- **Naming Utility** (for topic/group conventions)
- **Graceful Shutdown**

## Usage

### Import
```ts
import { kafka, CdcEvent } from '@/libs/kafka';
import { buildTopic, buildGroup, Verticals, Actions, isValidTopicName } from '@/libs/kafka/naming';
```

### Naming Utility
**Recommended:** Use the naming utility to generate and validate all topic/group names.

```ts
const topic = buildTopic(Verticals.RESTAURANT, Actions.CREATED, 'reservation', 'table');
// 'restaurant.created.reservation.table'

const group = buildGroup(Verticals.RESTAURANT, 'reservation', 'notifier');
// 'restaurant.reservation.notifier'

isValidTopicName(topic); // true
```

#### Customizing for Your Business
- **Add your own verticals:**
  ```ts
  export const Verticals = {
    RESTAURANT: 'restaurant',
    EXPERIENCE: 'experience',
    HOTEL: 'hotel',
    FLIGHT: 'flight',
    CORE: 'core',
    // Add more as needed
  } as const;
  ```
- **Add your own actions:**
  ```ts
  export const Actions = {
    CREATED: 'created',
    UPDATED: 'updated',
    DELETED: 'deleted',
    BOOKED: 'booked',
    CANCELLED: 'cancelled',
    // Add more as needed
  } as const;
  ```
- **Modules and keys** are free-form strings, but you can also define enums for common ones.

**Always use the builder functions for topic/group names to ensure consistency.**

### Pub/Sub
```ts
await kafka.publish(topic, { userId: 123 });
kafka.subscribe(topic, async (msg) => { ... });
```

### Request/Reply
```ts
const result = await kafka.sendRequest(topic, { a: 1, b: 2 });
kafka.replyTo(topic, async (req) => req.a + req.b);
```

### Stream Processing
```ts
kafka.consumeStream(topic, group, async (msg) => { ... });
```

### CDC (Change Data Capture)
```ts
kafka.cdcConsume(topic, group, async (event) => { ... });
await kafka.cdcPublish(topic, { ... });
```

### Graceful Shutdown
```ts
await kafka.disconnectAll();
```

## API
- `publish(topic: string, message: any): Promise<void>`
- `subscribe(topic: string, handler: (msg: any) => Promise<void> | void): Promise<void>`
- `sendRequest(topic: string, message: any, options?: { timeoutMs?: number }): Promise<any>`
- `replyTo(topic: string, handler: (msg: any) => Promise<any> | any): Promise<void>`
- `consumeStream(topic: string, groupId: string, handler: (msg: any) => Promise<void> | void): Promise<void>`
- `cdcConsume<T>(topic: string, groupId: string, handler: (event: CdcEvent<T>) => Promise<void> | void): Promise<void>`
- `cdcPublish<T>(topic: string, event: CdcEvent<T>): Promise<void>`
- `disconnectAll(): Promise<void>`
- `buildTopic(vertical, action, module, key): string`
- `buildGroup(vertical, module, purpose): string`
- `isValidTopicName(name: string): boolean`
- `Verticals`, `Actions` enums

## Notes
- All messages are JSON-serialized by default.
- Request/Reply uses correlation IDs and a reply topic under the hood.
- CDC events follow a standard shape for easy integration with Debezium, Kafka Connect, or custom CDC.
- You must set `KAFKA_BROKERS` and `KAFKA_CLIENT_ID` in your `.env`.
- **Always use the naming utility for topic/group names to ensure consistency.**

---
MIT License 