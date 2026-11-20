import { logger } from '../utils/logger.js';
/**
 * Email delivery adapter. No SMTP/transactional provider is configured in this build, so messages are
 * written to the server log (development) — wire a provider here (Resend, SES, Postmark) for production.
 * In Supabase auth mode, Supabase sends auth emails itself and this adapter is not used for them.
 */
export async function sendEmail(to: string, subject: string, text: string) {
  logger.info({ to, subject, text }, 'email (log transport)');
}
