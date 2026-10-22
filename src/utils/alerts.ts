// 2026-10-22 11:37, #64 error alert emails: 5xx responses, crashes and failed background jobs reach a person instead of
// only the log. The first error mails at once; later ones within the cooldown are counted and sent as one summary.
// On in production (ALERTS=off disables it); elsewhere only with ALERTS=on.
import os from 'os';
import express from 'express';
import { EmailService } from '../services/EmailService';

type Send = (subject: string, text: string) => Promise<unknown>;

/** Path for logs and alerts: no query string, link tokens masked (same rule as the access log, #59). */
export const safePath = (url: string) => url.split('?')[0].replace(/\/(g|invite|scan)\/[^/]+/, '/$1/***');

const describe = (err: unknown) => {
  if (!err) return '';
  if (err instanceof Error) return (err.stack || `${err.name}: ${err.message}`).split('\n').slice(0, 8).join('\n').slice(0, 1500);
  return String(err).slice(0, 500);
};

export class ErrorAlerts {
  private lastSentAt = -Infinity;
  private pending: string[] = [];
  private pendingCount = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(private send: Send, private cooldownMs = 15 * 60 * 1000, private now = () => Date.now()) {}

  /** Record an error; mails now or folds it into the next summary. Never throws. */
  report(source: string, err?: unknown): void {
    const line = `${new Date(this.now()).toISOString()}  ${source}${err ? '\n' + describe(err) : ''}`;
    if (this.now() - this.lastSentAt >= this.cooldownMs && !this.flushTimer) {
      this.mail(`[StayGuide] Error: ${source}`.slice(0, 150), [line], 1);
      return;
    }
    this.pendingCount++;
    if (this.pending.length < 20) this.pending.push(line); // keep the email readable; the count stays exact
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), Math.max(0, this.lastSentAt + this.cooldownMs - this.now()));
      this.flushTimer.unref?.();
    }
  }

  /** Send the summary of errors held back during the cooldown (also used before exiting on a crash). */
  flush(): Promise<unknown> {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    if (!this.pendingCount) return this.inFlight;
    const lines = this.pending, count = this.pendingCount;
    this.pending = []; this.pendingCount = 0;
    return this.mail(`[StayGuide] ${count} more error${count === 1 ? '' : 's'} in the last ${this.cooldownMs >= 60000 ? Math.round(this.cooldownMs / 60000) + ' min' : Math.round(this.cooldownMs / 1000) + ' s'}`, lines, count);
  }

  private mail(subject: string, lines: string[], count: number): Promise<unknown> {
    this.lastSentAt = this.now();
    const extra = count > lines.length ? `\n\n…and ${count - lines.length} more (see the server log).` : '';
    const text = `Server: ${os.hostname()}  (${process.env.APP_BASE_URL || 'no APP_BASE_URL'})\n\n${lines.join('\n\n')}${extra}\n\n` +
      `Details are in the Node.js log in Plesk. Further errors are collected for ${Math.round(this.cooldownMs / 60000) || 1} min and sent as one summary.`;
    const sending = this.send(subject, text).catch(e => console.error('[alerts] could not send alert email:', e));
    this.inFlight = Promise.all([this.inFlight, sending]);
    return this.inFlight;
  }
}

const enabled = () => process.env.ALERTS === 'on' || (process.env.NODE_ENV === 'production' && process.env.ALERTS !== 'off');
const recipient = () => process.env.ALERT_EMAIL || process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || '';

export const alerts = new ErrorAlerts(
  (subject, text) => new EmailService().sendEmail({ to: recipient(), subject, text, html: `<pre style="font: 13px/1.45 monospace; white-space: pre-wrap">${text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))}</pre>` }),
  Number(process.env.ALERT_COOLDOWN_MS) || undefined
);

export const reportError = (source: string, err?: unknown) => {
  if (enabled() && recipient()) alerts.report(source, err);
};

/** Every 5xx response, including the ones controllers answer themselves after catching an error. */
export const alertOn5xx: express.RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 500) reportError(`HTTP ${res.statusCode} ${req.method} ${safePath(req.originalUrl || req.url)}`);
  });
  next();
};

/** Crashes: mail, then exit so Plesk/Passenger starts a fresh process. Unhandled rejections are mailed and logged. */
export function installCrashAlerts() {
  process.on('unhandledRejection', reason => {
    console.error('Unhandled promise rejection:', reason);
    reportError('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', err => {
    console.error('Uncaught exception, exiting:', err);
    reportError('Server crashed (uncaught exception)', err);
    const exit = () => process.exit(1);
    setTimeout(exit, 5000).unref();
    alerts.flush().finally(exit); // waits for the crash email (and any held-back summary), at most 5 s
  });
}
