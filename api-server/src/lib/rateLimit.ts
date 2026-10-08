import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const clientIp = (req: Request): string => {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  return raw?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
};

/** Simple in-memory limiter (fine for a single Render instance). */
export const rateLimit =
  (name: string, max: number, windowMs: number) =>
  (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${name}:${clientIp(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many requests. Please try again in a few minutes." });
      return;
    }
    next();
  };

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000).unref();
