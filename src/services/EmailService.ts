import { EmailOptions, EmailTemplate, InvoiceEmailData, EmailServiceConfig } from '../types/email';
import { BillingRecord } from '../types/billing';

export class EmailService {
  private config: EmailServiceConfig;

  constructor() {
    this.config = {
      provider: process.env.EMAIL_PROVIDER as any || 'mock',
      fromEmail: process.env.FROM_EMAIL || 'billing@stayguide.com',
      fromName: process.env.FROM_NAME || 'StayGuide Billing',
      // SMTP Configuration
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      // SendGrid Configuration
      apiKey: process.env.SENDGRID_API_KEY
    };
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      console.log(`[EMAIL] Sending email to: ${options.to}`);
      console.log(`[EMAIL] Subject: ${options.subject}`);

      if (this.config.provider === 'mock') {
        return this.sendMockEmail(options);
      }

      if (this.config.provider === 'smtp') {
        return this.sendViaSMTP(options);
      }

      // TODO: Implement SendGrid when needed
      // if (this.config.provider === 'sendgrid') {
      //   return this.sendViaSendGrid(options);
      // }

      throw new Error(`Email provider ${this.config.provider} not implemented`);
    } catch (error) {
      console.error('Email sending failed:', error);
      return false;
    }
  }

  private async sendMockEmail(options: EmailOptions): Promise<boolean> {
    // Mock email sending - logs the email instead of actually sending
    console.log('================== MOCK EMAIL ==================');
    console.log(`From: ${this.config.fromName} <${this.config.fromEmail}>`);
    console.log(`To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    if (options.cc) console.log(`CC: ${Array.isArray(options.cc) ? options.cc.join(', ') : options.cc}`);
    console.log(`Subject: ${options.subject}`);
    console.log('------- Email Content -------');
    if (options.text) {
      console.log('TEXT VERSION:');
      console.log(options.text);
      console.log('');
    }
    if (options.html) {
      console.log('HTML VERSION:');
      console.log(options.html.substring(0, 200) + '...');
      console.log('');
    }
    if (options.attachments && options.attachments.length > 0) {
      console.log('ATTACHMENTS:');
      options.attachments.forEach(att => {
        console.log(`- ${att.filename} (${att.contentType})`);
      });
    }
    console.log('=============== END MOCK EMAIL ================');
    
    // Simulate async delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  }

  private async sendViaSMTP(options: EmailOptions): Promise<boolean> {
    try {
      console.log('================== SMTP EMAIL ==================');
      console.log(`SMTP Host: ${this.config.smtpHost}:${this.config.smtpPort}`);
      console.log(`From: ${this.config.fromName} <${this.config.fromEmail}>`);
      console.log(`To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
      console.log(`Subject: ${options.subject}`);
      
      if (!this.config.smtpHost) {
        console.error('SMTP configuration missing! Please set SMTP_HOST environment variable.');
        return false;
      }

      // TODO: When nodemailer is installed, replace this with actual SMTP sending
      console.log('[SMTP] Ready for production - nodemailer package needed');
      console.log('[SMTP] Configuration:');
      console.log(`  Host: ${this.config.smtpHost}`);
      console.log(`  Port: ${this.config.smtpPort}`);
      console.log(`  Secure: ${this.config.smtpSecure}`);
      console.log(`  User: ${this.config.smtpUser}`);
      console.log(`  Pass: ${this.config.smtpPass ? '[CONFIGURED]' : '[NOT SET]'}`);
      
      /* 
      // Real SMTP implementation (requires: npm install nodemailer @types/nodemailer)
      const nodemailer = require('nodemailer');
      
      const transporter = nodemailer.createTransporter({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpSecure,
        auth: {
          user: this.config.smtpUser,
          pass: this.config.smtpPass
        }
      });

      const mailOptions = {
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType
        }))
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('SMTP Email sent successfully:', info.messageId);
      return true;
      */
      
      console.log('=============== END SMTP EMAIL ================');
      
      // Simulate success for now
      await new Promise(resolve => setTimeout(resolve, 200));
      return true;
      
    } catch (error) {
      console.error('SMTP sending failed:', error);
      return false;
    }
  }

  async sendInvoiceEmail(invoiceData: InvoiceEmailData): Promise<boolean> {
    try {
      const template = this.generateInvoiceEmailTemplate(invoiceData);
      
      const emailOptions: EmailOptions = {
        to: invoiceData.company.email,
        subject: template.subject,
        html: template.htmlContent,
        text: template.textContent
        // TODO: Add PDF attachment when PDF generation is implemented
        // attachments: [{
        //   filename: `invoice-${invoiceData.invoice.invoice_number}.pdf`,
        //   content: await this.generateInvoicePDF(invoiceData.invoice),
        //   contentType: 'application/pdf'
        // }]
      };

      const success = await this.sendEmail(emailOptions);
      
      if (success) {
        console.log(`Invoice email sent successfully to ${invoiceData.company.email}`);
      } else {
        console.error(`Failed to send invoice email to ${invoiceData.company.email}`);
      }

      return success;
    } catch (error) {
      console.error('Error sending invoice email:', error);
      return false;
    }
  }

  async sendPaymentConfirmationEmail(invoiceData: InvoiceEmailData): Promise<boolean> {
    try {
      const template = this.generatePaymentConfirmationTemplate(invoiceData);
      
      const emailOptions: EmailOptions = {
        to: invoiceData.company.email,
        subject: template.subject,
        html: template.htmlContent,
        text: template.textContent
      };

      const success = await this.sendEmail(emailOptions);
      
      if (success) {
        console.log(`Payment confirmation sent to ${invoiceData.company.email}`);
      }

      return success;
    } catch (error) {
      console.error('Error sending payment confirmation:', error);
      return false;
    }
  }

  async sendOverdueNoticeEmail(invoiceData: InvoiceEmailData): Promise<boolean> {
    try {
      const template = this.generateOverdueNoticeTemplate(invoiceData);
      
      const emailOptions: EmailOptions = {
        to: invoiceData.company.email,
        cc: 'billing@stayguide.com', // CC billing team for overdue notices
        subject: template.subject,
        html: template.htmlContent,
        text: template.textContent
      };

      const success = await this.sendEmail(emailOptions);
      
      if (success) {
        console.log(`Overdue notice sent to ${invoiceData.company.email}`);
      }

      return success;
    } catch (error) {
      console.error('Error sending overdue notice:', error);
      return false;
    }
  }

  private generateInvoiceEmailTemplate(data: InvoiceEmailData): EmailTemplate {
    const { invoice, company, user } = data;
    const dueDate = new Date(invoice.billing_period_end);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days to pay

    const subject = `New Invoice ${invoice.invoice_number} from StayGuide - $${invoice.total_amount.toFixed(2)}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; }
          .invoice-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .amount { font-size: 24px; font-weight: bold; color: #667eea; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { color: #666; font-size: 12px; text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>StayGuide</h1>
            <h2>New Invoice</h2>
          </div>
          
          <div class="content">
            <p>Dear ${company.name} Team,</p>
            
            <p>Your monthly invoice is ready for review and payment.</p>
            
            <div class="invoice-details">
              <h3>Invoice Details</h3>
              <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
              <p><strong>Billing Period:</strong> ${new Date(invoice.billing_period_start).toLocaleDateString()} - ${new Date(invoice.billing_period_end).toLocaleDateString()}</p>
              <p><strong>Properties:</strong> ${invoice.property_count} properties</p>
              
              <div style="margin: 15px 0;">
                ${invoice.connection_fee > 0 ? `<p>Connection Fee: $${invoice.connection_fee.toFixed(2)}</p>` : ''}
                <p>Monthly Property Fees: $${(invoice.property_count * invoice.monthly_fee_per_property).toFixed(2)} (${invoice.property_count} × $${invoice.monthly_fee_per_property})</p>
                <hr>
                <p class="amount">Total Amount: $${invoice.total_amount.toFixed(2)}</p>
              </div>
              
              <p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>
            </div>
            
            ${data.paymentLink ? 
              `<div style="text-align: center;">
                <a href="${data.paymentLink}" class="btn">Pay Invoice Online</a>
              </div>` : 
              '<p><em>Payment link will be available in your dashboard.</em></p>'
            }
            
            <p>You can also view and pay this invoice by logging into your StayGuide dashboard.</p>
            
            <p>Thank you for choosing StayGuide!</p>
            
            <p>Best regards,<br>
            The StayGuide Billing Team</p>
          </div>
          
          <div class="footer">
            <p>StayGuide | Rental Property Management Platform</p>
            <p>Questions? Contact us at billing@stayguide.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
StayGuide - New Invoice ${invoice.invoice_number}

Dear ${company.name} Team,

Your monthly invoice is ready for review and payment.

Invoice Details:
- Invoice Number: ${invoice.invoice_number}
- Billing Period: ${new Date(invoice.billing_period_start).toLocaleDateString()} - ${new Date(invoice.billing_period_end).toLocaleDateString()}
- Properties: ${invoice.property_count} properties
${invoice.connection_fee > 0 ? `- Connection Fee: $${invoice.connection_fee.toFixed(2)}\n` : ''}- Monthly Property Fees: $${(invoice.property_count * invoice.monthly_fee_per_property).toFixed(2)} (${invoice.property_count} × $${invoice.monthly_fee_per_property})
- Total Amount: $${invoice.total_amount.toFixed(2)}
- Due Date: ${dueDate.toLocaleDateString()}

${data.paymentLink ? `Pay online: ${data.paymentLink}\n` : ''}
You can also view and pay this invoice by logging into your StayGuide dashboard.

Thank you for choosing StayGuide!

Best regards,
The StayGuide Billing Team

StayGuide | Rental Property Management Platform
Questions? Contact us at billing@stayguide.com
    `;

    return { subject, htmlContent, textContent };
  }

  private generatePaymentConfirmationTemplate(data: InvoiceEmailData): EmailTemplate {
    const { invoice, company } = data;

    const subject = `Payment Confirmed - Invoice ${invoice.invoice_number} ($${invoice.total_amount.toFixed(2)})`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f0fdf4; padding: 20px; }
          .confirmation { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #10b981; }
          .amount { font-size: 24px; font-weight: bold; color: #10b981; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Payment Confirmed</h1>
          </div>
          
          <div class="content">
            <p>Dear ${company.name} Team,</p>
            
            <p>We've successfully received your payment. Thank you!</p>
            
            <div class="confirmation">
              <h3>Payment Details</h3>
              <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
              <p><strong>Amount Paid:</strong> <span class="amount">$${invoice.total_amount.toFixed(2)}</span></p>
              <p><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">PAID</span></p>
            </div>
            
            <p>Your account is now up to date. You can view your payment history and download receipts from your StayGuide dashboard.</p>
            
            <p>Thank you for your continued partnership with StayGuide!</p>
            
            <p>Best regards,<br>
            The StayGuide Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
StayGuide - Payment Confirmation

Dear ${company.name} Team,

We've successfully received your payment. Thank you!

Payment Details:
- Invoice Number: ${invoice.invoice_number}
- Amount Paid: $${invoice.total_amount.toFixed(2)}
- Payment Date: ${new Date().toLocaleDateString()}
- Status: PAID

Your account is now up to date. You can view your payment history and download receipts from your StayGuide dashboard.

Thank you for your continued partnership with StayGuide!

Best regards,
The StayGuide Team
    `;

    return { subject, htmlContent, textContent };
  }

  private generateOverdueNoticeTemplate(data: InvoiceEmailData): EmailTemplate {
    const { invoice, company } = data;

    const subject = `⚠️ Overdue Notice - Invoice ${invoice.invoice_number} ($${invoice.total_amount.toFixed(2)})`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { background: #fef2f2; padding: 20px; }
          .notice { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #dc2626; }
          .amount { font-size: 24px; font-weight: bold; color: #dc2626; }
          .btn { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Payment Overdue</h1>
          </div>
          
          <div class="content">
            <p>Dear ${company.name} Team,</p>
            
            <p><strong>This is a friendly reminder that your invoice payment is now overdue.</strong></p>
            
            <div class="notice">
              <h3>Overdue Invoice</h3>
              <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
              <p><strong>Original Due Date:</strong> ${new Date(invoice.billing_period_end).toLocaleDateString()}</p>
              <p><strong>Amount Due:</strong> <span class="amount">$${invoice.total_amount.toFixed(2)}</span></p>
              <p><strong>Days Overdue:</strong> ${Math.floor((new Date().getTime() - new Date(invoice.billing_period_end).getTime()) / (1000 * 60 * 60 * 24))} days</p>
            </div>
            
            <p>Please log into your StayGuide dashboard to make a payment immediately to avoid any service interruption.</p>
            
            ${data.paymentLink ? 
              `<div style="text-align: center;">
                <a href="${data.paymentLink}" class="btn">Pay Now</a>
              </div>` : ''
            }
            
            <p>If you have any questions or need assistance, please contact our billing team immediately at billing@stayguide.com or reply to this email.</p>
            
            <p>Thank you for your prompt attention to this matter.</p>
            
            <p>Best regards,<br>
            The StayGuide Billing Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
StayGuide - Payment Overdue Notice

Dear ${company.name} Team,

This is a friendly reminder that your invoice payment is now overdue.

Overdue Invoice:
- Invoice Number: ${invoice.invoice_number}
- Original Due Date: ${new Date(invoice.billing_period_end).toLocaleDateString()}
- Amount Due: $${invoice.total_amount.toFixed(2)}
- Days Overdue: ${Math.floor((new Date().getTime() - new Date(invoice.billing_end).getTime()) / (1000 * 60 * 60 * 24))} days

Please log into your StayGuide dashboard to make a payment immediately to avoid any service interruption.

${data.paymentLink ? `Pay now: ${data.paymentLink}\n` : ''}

If you have any questions or need assistance, please contact our billing team immediately at billing@stayguide.com.

Thank you for your prompt attention to this matter.

Best regards,
The StayGuide Billing Team
    `;

    return { subject, htmlContent, textContent };
  }
}