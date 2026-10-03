// 2026-10-03 11:39, minimal in-memory fixed-window rate limiter (single-process; fine for one Plesk Node instance)
import { Request, Response, NextFunction } from 'express';

export const rateLimit = (options: {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
  message?: string;
}) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = options.key(req);
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      hits.set(key, entry);
    }

    entry.count++;
    if (entry.count > options.max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000).toString());
      return res.status(429).json({ error: options.message || 'Too many requests, please try again later' });
    }

    // Opportunistic cleanup so the map doesn't grow unbounded
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    next();
  };
};
