// Redis disabled for local development.
// Rate limiting and session storage use in-memory stores instead.
// To re-enable Redis: install ioredis, connect-redis, rate-limit-redis
// and restore the original implementation.

export const redis = null;
