export interface EmailTemplate {
  subject: string;
  htmlContent: string;
  textContent: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  fromName?: string; // 2026-10-07 18:50, e.g. "Demo Rentals via StayGuide" (address stays FROM_EMAIL)
}

export interface InvoiceEmailData {
  invoice: any;
  company: any;
  user: any;
  paymentLink?: string;
}

export interface EmailServiceConfig {
  provider: 'mock' | 'smtp' | 'sendgrid';
  fromEmail: string;
  fromName: string;
  // SMTP Configuration
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  // SendGrid Configuration
  apiKey?: string;
}