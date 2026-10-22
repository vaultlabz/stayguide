import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import routes from './routes';
import { startOpsScheduler } from './jobs/ops-scheduler'; // 2026-10-08 07:50, G7 Ops
import { BillingPlanController } from './controllers/BillingPlanController';
import { assertProductionConfig } from './utils/production-check'; // 2026-10-09 08:15, #46
import { alertOn5xx, installCrashAlerts, safePath } from './utils/alerts'; // 2026-10-22 11:37, #64

dotenv.config();
assertProductionConfig(); // 2026-10-09 08:15, #46: stop a misconfigured production start before it listens
installCrashAlerts(); // 2026-10-22 11:37, #64 crash / unhandled rejection emails

const app = express();
const PORT = process.env.PORT || 3000;

// 2026-10-03 11:39, behind Plesk nginx req.ip is the proxy unless we trust it (rate limits key on client IP)
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 2026-10-10 19:27, #59 no 'unsafe-eval' (nothing uses eval/new Function). 'unsafe-inline' stays: every view has inline scripts.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      // 2026-10-06 14:40, landing hero: Google Fonts (Playfair Display + Inter) stylesheet and font files
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      // 2026-10-03 11:58, in-app video embeds on the tablet (YouTube privacy mode + Vimeo)
      frameSrc: ["https://www.youtube-nocookie.com", "https://player.vimeo.com"],
    },
  },
}));
// 2026-10-10 19:27, #59 CORS only for origins listed in CORS_ORIGINS (comma-separated). The app itself is same-origin and needs none.
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
if (corsOrigins.length) app.use(cors({ origin: corsOrigins }));
// 2026-10-10 19:27, #59 access log without secrets: query strings (reset tokens) and link tokens (/g/, invite, QR scan) are masked,
// and the referrer is left out because it can carry the same tokens.
// 2026-10-22 11:37, #64 masking moved to utils/alerts safePath (alerts use the same rule)
morgan.token('safe-url', (req: express.Request) => safePath(req.originalUrl || req.url));
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":user-agent"'));
app.use(alertOn5xx); // 2026-10-22 11:37, #64 email on 5xx responses (throttled)
// 2026-10-03 23:06, G3 Stripe webhook needs the raw body for signature verification, so it is mounted before express.json()
const billingWebhook = new BillingPlanController();
app.post('/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), billingWebhook.webhook.bind(billingWebhook));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/css', express.static(path.join(__dirname, '../public/css')));
// 2026-10-03 15:31, shared theme switcher script
app.use('/js', express.static(path.join(__dirname, '../public/js')));
// 2026-10-03 16:42, pre-rendered tablet gradient backgrounds (/img/gradients/*.webp)
app.use('/img', express.static(path.join(__dirname, '../public/img')));

// 2026-10-03 11:52, tablet PWA files. sw.js must not be HTTP-cached or tablets keep stale workers.
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '../public/sw.js'));
});
app.get('/manifest.json', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, '../public/manifest.json'));
});
app.use('/icons', express.static(path.join(__dirname, '../public/icons')));
// 2026-10-08 05:50, G7 Ops stage 5: worker app PWA (registered with scope /maint, separate from the tablet's sw.js)
app.get('/maint-sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '../public/maint-sw.js'));
});
app.get('/maint-manifest.json', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, '../public/maint-manifest.json'));
});

// Routes
app.use('/', routes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  // 2026-10-10 19:27, #59 server errors (5xx) no longer send their internal message to the browser in production
  const status = err.status || 500;
  res.status(status).json({
    error: status < 500 || process.env.NODE_ENV !== 'production' ? (err.message || 'Internal server error') : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  startOpsScheduler(); // 2026-10-08 07:50, G7 Ops reminders (hourly)
  console.log(`StayGuide server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`); // 2026-10-10 19:27, #59 route list removed
});