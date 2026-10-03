// 2026-10-03 12:32, Phase 5: QR scan redirects  /r/:propertyId/book | review | showcase/:targetId
// Only redirects to URLs configured on the property (no open redirect); every scan is counted.
import express from 'express';
import { PropertyService } from '../services/PropertyService';
import { CompanyService } from '../services/CompanyService';
import { LinkService, LinkKind, LinkMedium } from '../services/LinkService';
import { rateLimit } from '../middleware/rate-limit';

const router = express.Router();
const propertyService = new PropertyService();
const companyService = new CompanyService();
const linkService = new LinkService();

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  key: req => `scan:${req.ip}`,
  message: 'Too many requests'
});

const notAvailable = (res: express.Response) =>
  res.status(404).type('text/plain').send('This link is no longer available.');

async function handleScan(req: express.Request, res: express.Response, kind: LinkKind, targetId: number | null) {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const medium: LinkMedium = req.query.m === 'tablet' ? 'tablet' : 'qr';

    const property = Number.isInteger(propertyId) ? await propertyService.findById(propertyId) : null;
    if (!property || property.status !== 'active') return notAvailable(res);

    const company = await companyService.findById(property.company_id);
    if (!company || company.status !== 'active') return notAvailable(res);

    let target = null;
    if (kind === 'showcase') {
      target = targetId !== null ? await propertyService.findById(targetId) : null;
      // Showcase targets must be active properties of the same company
      if (!target || target.company_id !== property.company_id || target.status !== 'active') return notAvailable(res);
    }

    // Validate the destination before recording, so broken links don't inflate counts
    if (!linkService.buildDestination(property, target, kind, medium, 'check')) return notAvailable(res);

    const clickId = await linkService.recordClick(property.id, kind, medium, target ? target.id : null);
    const destination = linkService.buildDestination(property, target, kind, medium, clickId)!;

    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, destination);
  } catch (error) {
    console.error('Error handling link scan:', error);
    res.status(500).type('text/plain').send('Something went wrong. Please try again.');
  }
}

router.get('/r/:propertyId/book', scanLimiter, (req, res) => handleScan(req, res, 'book', null));
router.get('/r/:propertyId/review', scanLimiter, (req, res) => handleScan(req, res, 'review', null));
router.get('/r/:propertyId/showcase/:targetId', scanLimiter, (req, res) => handleScan(req, res, 'showcase', parseInt(req.params.targetId)));

export default router;
