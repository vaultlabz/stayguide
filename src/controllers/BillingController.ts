import { Request, Response } from 'express';
import { BillingService } from '../services/BillingService';
import { AuthRequest } from '../types';

export class BillingController {
  private billingService: BillingService;

  constructor() {
    this.billingService = new BillingService();
  }

  async createBillingRecord(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { company_id, billing_period_start, billing_period_end, property_count } = req.body;

      if (!company_id || !billing_period_start || !billing_period_end || property_count === undefined) {
        res.status(400).json({ 
          error: 'Missing required fields: company_id, billing_period_start, billing_period_end, property_count' 
        });
        return;
      }

      // Authorization check - super admin or company admin for own company
      if (req.user?.role !== 'super_admin' && req.user?.company_id !== company_id) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      const billingData = {
        company_id,
        billing_period_start: new Date(billing_period_start),
        billing_period_end: new Date(billing_period_end),
        property_count: parseInt(property_count)
      };

      const billing = await this.billingService.createBillingRecord(billingData);
      
      console.log(`Billing record created: ${billing.invoice_number}`);
      res.status(201).json({ 
        success: true, 
        billing,
        message: 'Billing record created successfully'
      });
    } catch (error) {
      console.error('Error creating billing record:', error);
      res.status(500).json({ 
        error: 'Failed to create billing record',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getBillingRecords(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = parseInt(req.params.companyId);

      // Authorization check - super admin or company admin for own company
      if (req.user?.role !== 'super_admin' && req.user?.company_id !== companyId) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      const billings = await this.billingService.getBillingRecordsByCompany(companyId);
      const stats = await this.billingService.getBillingStats(companyId);
      
      console.log(`Retrieved ${billings.length} billing records for company ${companyId}`);
      res.json({ 
        success: true, 
        billings,
        stats,
        company_id: companyId
      });
    } catch (error) {
      console.error('Error fetching billing records:', error);
      res.status(500).json({ 
        error: 'Failed to fetch billing records',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAllBillingRecords(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Super admin only
      if (req.user?.role !== 'super_admin') {
        res.status(403).json({ error: 'Super admin access required' });
        return;
      }

      const stats = await this.billingService.getBillingStats();
      
      console.log('Retrieved global billing stats');
      res.json({ 
        success: true, 
        stats,
        message: 'Global billing statistics'
      });
    } catch (error) {
      console.error('Error fetching global billing records:', error);
      res.status(500).json({ 
        error: 'Failed to fetch billing records',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateBillingStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const billingId = parseInt(req.params.billingId);
      const { status, stripe_payment_intent_id } = req.body;

      if (!status || !['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
        res.status(400).json({ 
          error: 'Invalid status. Must be: pending, paid, overdue, or cancelled' 
        });
        return;
      }

      // Super admin only for now (later we'll add Stripe webhook handling)
      if (req.user?.role !== 'super_admin') {
        res.status(403).json({ error: 'Super admin access required' });
        return;
      }

      const billing = await this.billingService.updateBillingStatus(billingId, status, stripe_payment_intent_id);
      
      if (!billing) {
        res.status(404).json({ error: 'Billing record not found' });
        return;
      }

      console.log(`Billing record ${billingId} status updated to: ${status}`);
      res.json({ 
        success: true, 
        billing,
        message: `Billing status updated to ${status}`
      });
    } catch (error) {
      console.error('Error updating billing status:', error);
      res.status(500).json({ 
        error: 'Failed to update billing status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createPaymentIntent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const billingId = parseInt(req.params.billingId);

      // Get billing record
      const billing = await this.billingService.getBillingRecordById(billingId);
      if (!billing) {
        res.status(404).json({ error: 'Billing record not found' });
        return;
      }

      // Authorization check - super admin or company admin for own company
      if (req.user?.role !== 'super_admin' && req.user?.company_id !== billing.company_id) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      if (billing.status === 'paid') {
        res.status(400).json({ error: 'Billing record already paid' });
        return;
      }

      // TODO: Integrate with Stripe here
      // For now, return mock payment intent
      const mockPaymentIntent = {
        id: `pi_mock_${Date.now()}`,
        amount: Math.round(billing.total_amount * 100), // Convert to cents
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: `pi_mock_${Date.now()}_secret_mock`
      };

      console.log(`Mock payment intent created for billing ${billingId}: ${mockPaymentIntent.id}`);
      res.json({ 
        success: true, 
        payment_intent: mockPaymentIntent,
        billing,
        message: 'Payment intent created (mock mode)'
      });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ 
        error: 'Failed to create payment intent',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getInvoiceDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const billingId = parseInt(req.params.billingId);

      // Super admin only for now
      if (req.user?.role !== 'super_admin') {
        res.status(403).json({ error: 'Super admin access required' });
        return;
      }

      const billing = await this.billingService.getBillingRecordById(billingId);
      if (!billing) {
        res.status(404).json({ error: 'Billing record not found' });
        return;
      }

      // Get company details for the invoice
      const companyData = await this.billingService.getInvoiceWithCompanyDetails(billingId);
      
      res.json({ 
        success: true, 
        invoice: billing,
        company: companyData.company,
        user: companyData.user
      });
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      res.status(500).json({ 
        error: 'Failed to fetch invoice details',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendInvoiceEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const billingId = parseInt(req.params.billingId);

      // Super admin only
      if (req.user?.role !== 'super_admin') {
        res.status(403).json({ error: 'Super admin access required' });
        return;
      }

      const billing = await this.billingService.getBillingRecordById(billingId);
      if (!billing) {
        res.status(404).json({ error: 'Billing record not found' });
        return;
      }

      // Send the invoice email
      const success = await this.billingService.resendInvoiceEmail(billingId);
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'Invoice email sent successfully',
          billing_id: billingId,
          invoice_number: billing.invoice_number
        });
      } else {
        res.status(500).json({ 
          error: 'Failed to send invoice email'
        });
      }
    } catch (error) {
      console.error('Error sending invoice email:', error);
      res.status(500).json({ 
        error: 'Failed to send invoice email',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}