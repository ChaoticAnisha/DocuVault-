import 'dotenv/config';
import express from 'express';

// Prisma returns BigInt for storage-size fields (sizeBytes, storageUsed, storageLimitBytes).
// JSON.stringify cannot serialise BigInt natively; this patch converts them to strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { logger } from './config/logger';
import './config/passport'; // registers the Google strategy
import passport from 'passport';
import { securityHeaders } from './middleware/securityHeaders';
import { requestLogger } from './middleware/logger';
import { sanitizeInput } from './middleware/inputSanitizer';
import { errorHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';
import { runSecurityAudit } from './utils/securityAudit';
import { scheduleAlertChecks } from './utils/securityMonitor';
import routes from './routes';

// Verify all required secrets and env vars before accepting traffic.
// Calls process.exit(1) if any required value is missing or invalid.
runSecurityAudit();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Trust the first proxy hop (nginx) so req.ip reflects the real client IP.
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(securityHeaders);
app.disable('x-powered-by');

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-csrf-token'],
  })
);

// ── Body / cookie parsing ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Session (MemoryStore — sufficient for local dev; use Redis in production) ──
app.use(
  session({
    secret: process.env.SESSION_SECRET as string,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // set to true behind HTTPS in production
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ── Request logging, sanitization, global rate limit ─────────────────────────
app.use(requestLogger);
app.use(sanitizeInput);
app.use(generalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  scheduleAlertChecks();
});

export default app;
