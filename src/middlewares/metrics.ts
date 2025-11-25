import { Elysia } from "elysia";

// Simple metrics store (in production, use a proper metrics library)
class MetricsStore {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private gauges = new Map<string, number>();

  incrementCounter(name: string, labels: Record<string, string> = {}) {
    const key = this.getKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}) {
    const key = this.getKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}) {
    const key = this.getKey(name, labels);
    this.gauges.set(key, value);
  }

  private getKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  exportMetrics(): string {
    const lines: string[] = [];

    // Export counters
    for (const [key, value] of this.counters) {
      lines.push(`# TYPE ${key.split("{")[0]} counter`);
      lines.push(`${key} ${value}`);
    }

    // Export histograms (simplified - just count and sum)
    for (const [key, values] of this.histograms) {
      const baseName = key.split("{")[0];
      const count = values.length;
      const sum = values.reduce((a, b) => a + b, 0);

      lines.push(`# TYPE ${baseName} histogram`);
      lines.push(`${key.replace(baseName, baseName + "_count")} ${count}`);
      lines.push(`${key.replace(baseName, baseName + "_sum")} ${sum}`);
    }

    // Export gauges
    for (const [key, value] of this.gauges) {
      lines.push(`# TYPE ${key.split("{")[0]} gauge`);
      lines.push(`${key} ${value}`);
    }

    return lines.join("\n") + "\n";
  }
}

const metrics = new MetricsStore();

// Update system metrics periodically
setInterval(() => {
  const memUsage = process.memoryUsage();
  metrics.setGauge("nodejs_memory_usage_bytes", memUsage.rss, { type: "rss" });
  metrics.setGauge("nodejs_memory_usage_bytes", memUsage.heapUsed, { type: "heap_used" });
  metrics.setGauge("nodejs_memory_usage_bytes", memUsage.heapTotal, { type: "heap_total" });

  const cpuUsage = process.cpuUsage();
  metrics.setGauge("nodejs_cpu_usage_seconds", cpuUsage.user / 1000000, { type: "user" });
  metrics.setGauge("nodejs_cpu_usage_seconds", cpuUsage.system / 1000000, { type: "system" });
}, 10000);

export const metricsMiddleware = new Elysia({ name: "metrics" })
  .derive({ as: "global" }, () => ({
    startTime: Date.now(),
  }))
  .onRequest(({ request }) => {
    // Track request count
    const url = new URL(request.url);
    metrics.incrementCounter("http_requests_total", {
      method: request.method,
      path: url.pathname,
    });
  })
  .onAfterResponse(({ request, response, startTime }) => {
    // Track response time
    const duration = Date.now() - startTime;
    const url = new URL(request.url);
    const status = (response as any)?.status || "unknown";

    metrics.recordHistogram("http_request_duration_ms", duration, {
      method: request.method,
      status: status.toString(),
      path: url.pathname,
    });

    // Track response status codes
    metrics.incrementCounter("http_responses_total", {
      method: request.method,
      status: status.toString(),
      path: url.pathname,
    });
  })
  .onError(({ request, error }) => {
    // Track errors
    const url = new URL(request.url);
    const errorName = (error as any)?.name || error?.constructor?.name || "UnknownError";
    metrics.incrementCounter("http_errors_total", {
      method: request.method,
      error: errorName,
      path: url.pathname,
    });
  })
  .get("/metrics", () => {
    return new Response(metrics.exportMetrics(), {
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      },
    });
  });

// Business metrics helpers
export const businessMetrics = {
  recordSignup: (provider: string = "email") => {
    metrics.incrementCounter("auth_signups_total", { provider });
  },
  recordSignin: (provider: string = "email", success: boolean = true) => {
    metrics.incrementCounter("auth_signins_total", {
      provider,
      status: success ? "success" : "failure",
    });
  },
  recordRateLimit: (endpoint: string) => {
    metrics.incrementCounter("auth_rate_limits_total", { endpoint });
  },
  recordDatabaseQuery: (operation: string, duration: number) => {
    metrics.recordHistogram("database_query_duration_ms", duration, { operation });
    metrics.incrementCounter("database_queries_total", { operation });
  },
  recordRedisOperation: (operation: string, duration: number) => {
    metrics.recordHistogram("redis_operation_duration_ms", duration, { operation });
    metrics.incrementCounter("redis_operations_total", { operation });
  },
  setActiveUsers: (count: number) => {
    metrics.setGauge("auth_active_users", count);
  },
  setActiveSessions: (count: number) => {
    metrics.setGauge("auth_active_sessions", count);
  },
};
