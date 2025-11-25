import { env } from "../../config/env";
import { Kafka, Producer, Consumer, EachMessagePayload, logLevel } from "kafkajs";
import { v4 as uuidv4 } from "uuid";

// --- Types ---
export interface KafkaMessage {
  topic: string;
  value: string;
}

export interface RequestOptions {
  timeoutMs?: number;
}

/**
 * CDC Event type for change data capture patterns
 * - operation: 'insert' | 'update' | 'delete'
 * - before: previous row (for update/delete)
 * - after: new row (for insert/update)
 * - timestamp: ISO string
 */
export interface CdcEvent<T = any> {
  operation: 'insert' | 'update' | 'delete';
  before: T | null;
  after: T | null;
  timestamp: string;
}

// --- Config ---
const brokers = (env.KAFKA_BROKERS || "").split(",").map(b => b.trim()).filter(Boolean);
const clientId = env.KAFKA_CLIENT_ID || "microservice-template";
if (!brokers.length) throw new Error("KAFKA_BROKERS must be set in your environment");

const kafkaClient = new Kafka({ clientId, brokers, logLevel: logLevel.ERROR });
const producer: Producer = kafkaClient.producer();
const consumers: Record<string, Consumer> = {};

// --- Internal helpers ---
const replyTopic = `${clientId}-replies`;
const pendingRequests: Record<string, (value: any) => void> = {};

// --- API ---
export const kafka = {
  /** Publish a message to a topic (Pub/Sub) */
  async publish(topic: string, message: any) {
    await producer.connect();
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
  },

  /** Subscribe to a topic (Pub/Sub, fan-out) */
  async subscribe(topic: string, handler: (msg: any) => Promise<void> | void) {
    const groupId = `${clientId}-${topic}-sub`;
    if (consumers[groupId]) return;
    const consumer = kafkaClient.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value) {
          try {
            await handler(JSON.parse(message.value.toString()));
          } catch (e) {
            // fallback: pass raw value
            await handler(message.value.toString());
          }
        }
      },
    });
    consumers[groupId] = consumer;
  },

  /** Send a request and await a reply (Request/Reply pattern) */
  async sendRequest(topic: string, message: any, options?: RequestOptions): Promise<any> {
    await producer.connect();
    const correlationId = uuidv4();
    const timeoutMs = options?.timeoutMs || 10000;
    // Listen for reply
    await kafka._ensureReplyConsumer();
    // Send request
    await producer.send({
      topic,
      messages: [{
        value: JSON.stringify(message),
        headers: {
          correlationId,
          replyTo: replyTopic,
        },
      }],
    });
    // Await reply
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete pendingRequests[correlationId];
        reject(new Error("Kafka request timed out"));
      }, timeoutMs);
      pendingRequests[correlationId] = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
    });
  },

  /** Reply to requests on a topic (Request/Reply pattern) */
  async replyTo(topic: string, handler: (msg: any) => Promise<any> | any) {
    const groupId = `${clientId}-${topic}-replier`;
    if (consumers[groupId]) return;
    const consumer = kafkaClient.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        let req: any;
        try {
          req = JSON.parse(message.value.toString());
        } catch {
          req = message.value.toString();
        }
        const correlationId = message.headers?.correlationId?.toString();
        const replyTo = message.headers?.replyTo?.toString();
        if (correlationId && replyTo) {
          const result = await handler(req);
          await producer.send({
            topic: replyTo,
            messages: [{
              value: JSON.stringify(result),
              headers: { correlationId },
            }],
          });
        }
      },
    });
    consumers[groupId] = consumer;
  },

  /** Consume a stream of events (Stream Processing, consumer group) */
  async consumeStream(topic: string, groupId: string, handler: (msg: any) => Promise<void> | void) {
    if (consumers[groupId]) return;
    const consumer = kafkaClient.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value) {
          try {
            await handler(JSON.parse(message.value.toString()));
          } catch (e) {
            await handler(message.value.toString());
          }
        }
      },
    });
    consumers[groupId] = consumer;
  },

  /** CDC: Consume change data capture events from a topic */
  async cdcConsume<T = any>(topic: string, groupId: string, handler: (event: CdcEvent<T>) => Promise<void> | void) {
    if (consumers[groupId]) return;
    const consumer = kafkaClient.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value) {
          try {
            const event: CdcEvent<T> = JSON.parse(message.value.toString());
            await handler(event);
          } catch (e) {
            // fallback: pass raw value
            await handler(message.value.toString() as any);
          }
        }
      },
    });
    consumers[groupId] = consumer;
  },

  /** CDC: Publish a change data capture event to a topic */
  async cdcPublish<T = any>(topic: string, event: CdcEvent<T>) {
    await producer.connect();
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(event) }],
    });
  },

  /** Disconnect all producers and consumers (graceful shutdown) */
  async disconnectAll() {
    await producer.disconnect();
    for (const groupId in consumers) {
      await consumers[groupId].disconnect();
      delete consumers[groupId];
    }
  },

  // --- Internal: reply consumer for request/reply ---
  async _ensureReplyConsumer() {
    const groupId = `${clientId}-reply-group`;
    if (consumers[groupId]) return;
    const consumer = kafkaClient.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic: replyTopic, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        const correlationId = message.headers?.correlationId?.toString();
        if (correlationId && pendingRequests[correlationId]) {
          let value: any;
          try {
            value = JSON.parse(message.value?.toString() || "");
          } catch {
            value = message.value?.toString();
          }
          pendingRequests[correlationId](value);
          delete pendingRequests[correlationId];
        }
      },
    });
    consumers[groupId] = consumer;
  },
};
