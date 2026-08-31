import type { RequestHandler } from 'express';

interface Bucket { count: number; resetAt: number }

export function createFixedWindowRateLimiter(limit: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || 'unknown';
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    if (bucket.count > limit) return response.status(429).json({ error: 'Too many authentication attempts' });
    return next();
  };
}

