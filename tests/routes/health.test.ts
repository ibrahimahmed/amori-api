import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';
import { healthRoutes } from '../../src/modules/health';

const app = new Elysia().use(healthRoutes);

describe('GET /health', () => {
  it('should return a valid status and a timestamp', async () => {
    const res = await app.handle(new Request('http://localhost/health'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(typeof body.timestamp).toBe('string');
  });
});
