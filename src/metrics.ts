import * as express from "@moneypot/caas/express";
import prometheus from "prom-client";

const NODE_ENV = process.env.NODE_ENV || "development";
const PROMETHEUS_METRICS_TOKEN = process.env.PROMETHEUS_METRICS_TOKEN || "";

prometheus.collectDefaultMetrics();

const metrics = {
  httpRequestDurationSeconds: new prometheus.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "handler", "status"],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  }),

  httpRequestsTotal: new prometheus.Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "handler", "status"],
  }),
};

const middleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const start = process.hrtime();

  // Prefer /users/:id over /users/42
  const handler = req.route?.path || req.path || "unknown";

  res.on("finish", () => {
    const duration = process.hrtime(start);
    const durationSeconds = duration[0] + duration[1] / 1e9;

    metrics.httpRequestDurationSeconds
      .labels(req.method, handler, res.statusCode.toString())
      .observe(durationSeconds);

    metrics.httpRequestsTotal
      .labels(req.method, handler, res.statusCode.toString())
      .inc();
  });

  next();
};

const authenticateMetricsRequest = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // In development, allow access to /metrics without a token
  if (NODE_ENV === "development" && !PROMETHEUS_METRICS_TOKEN) {
    next();
    return;
  }

  // Parse `Bearer {token}` from Authorization header
  const parts = req.headers.authorization?.split(" ") || [];
  if (
    parts.length !== 2 ||
    parts[0] !== "Bearer" ||
    !parts[1] ||
    parts[1] !== PROMETHEUS_METRICS_TOKEN
  ) {
    res.status(401).end("Access denied");
    return;
  }

  next();
};

const router = express.Router();
router.use(middleware);
router.get(
  "/metrics",
  authenticateMetricsRequest,
  async (_req: express.Request, res: express.Response) => {
    res.set("Content-Type", prometheus.register.contentType);
    res.end(await prometheus.register.metrics());
  }
);

export default router;
