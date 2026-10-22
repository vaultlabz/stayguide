// 2026-10-07 16:55, invoice PDF (download from the admin invoice page; attached to invoice emails). Built-in Helvetica, no external assets.
import PDFDocument from 'pdfkit';
import { BillingRecord } from '../types/billing';

const money = (n: number | string) => `$${(parseFloat(String(n)) || 0).toFixed(2)}`;
// UTC so a stored calendar date (e.g. 2025-01-01) is not shifted a day by the server's timezone
const day = (d: Date | string | undefined) => (d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');

export function renderInvoicePdf(invoice: BillingRecord, company: { name?: string; email?: string; phone?: string; address?: string } | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 56, info: { Title: `Invoice ${invoice.invoice_number || invoice.id}`, Author: 'StayGuide' } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const ink = '#1c1c1c';
    const muted = '#666666';
    const line = '#dddddd';

    // header
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(22).text('StayGuide', left, 56);
    doc.font('Helvetica').fontSize(10).fillColor(muted).text('Digital guest guides for short-term rentals', left, 84);
    doc.font('Helvetica-Bold').fontSize(18).fillColor(ink).text('INVOICE', left, 56, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(muted)
      .text(`No. ${invoice.invoice_number || invoice.id}`, left, 80, { width, align: 'right' })
      .text(`Issued ${day(invoice.created_at)}`, { width, align: 'right' })
      .text(`Status: ${String(invoice.status).toUpperCase()}${invoice.paid_at ? ` (${day(invoice.paid_at)})` : ''}`, { width, align: 'right' });

    // bill to + period
    let y = 150;
    doc.moveTo(left, y - 12).lineTo(right, y - 12).strokeColor(line).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('BILL TO', left, y);
    doc.text('BILLING PERIOD', left + width / 2, y);
    doc.font('Helvetica').fontSize(11).fillColor(ink);
    const billTo = [company?.name, company?.address, company?.email, company?.phone].filter(Boolean).join('\n');
    doc.text(billTo || `Company #${invoice.company_id}`, left, y + 14, { width: width / 2 - 12 });
    doc.text(`${day(invoice.billing_period_start)} – ${day(invoice.billing_period_end)}`, left + width / 2, y + 14);
    y = Math.max(doc.y, y + 60) + 28;

    // line items
    const colQty = left + width * 0.55;
    const colRate = left + width * 0.7;
    const row = (desc: string, qty: string, rate: string, amount: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(ink);
      doc.text(desc, left, y, { width: colQty - left - 8 });
      doc.text(qty, colQty, y, { width: colRate - colQty - 8, align: 'right' });
      doc.text(rate, colRate, y, { width: right - colRate - 90, align: 'right' });
      doc.text(amount, right - 80, y, { width: 80, align: 'right' });
      y += 22;
    };
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted);
    doc.text('DESCRIPTION', left, y).text('QTY', colQty, y, { width: colRate - colQty - 8, align: 'right' })
      .text('RATE', colRate, y, { width: right - colRate - 90, align: 'right' }).text('AMOUNT', right - 80, y, { width: 80, align: 'right' });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(line).stroke();
    y += 10;

    const connection = parseFloat(String(invoice.connection_fee)) || 0;
    const rate = parseFloat(String(invoice.monthly_fee_per_property)) || 0;
    if (connection > 0) row('Connection fee (one-time)', '1', money(connection), money(connection));
    row('Monthly property fee', String(invoice.property_count), money(rate), money(invoice.property_count * rate));

    doc.moveTo(colRate, y).lineTo(right, y).strokeColor(line).stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(ink);
    doc.text(invoice.status === 'paid' ? 'Total paid' : 'Total due', colRate, y, { width: right - colRate - 90, align: 'right' });
    doc.text(money(invoice.total_amount), right - 80, y, { width: 80, align: 'right' });

    // footer
    doc.font('Helvetica').fontSize(9).fillColor(muted)
      .text('Payment is due within 30 days of the end of the billing period. Questions: billing@stayguide.com',
        left, doc.page.height - doc.page.margins.bottom - 24, { width, align: 'center' });

    doc.end();
  });
}
