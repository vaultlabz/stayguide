import express from 'express';
import path from 'path';
import { AuthController } from '../controllers/AuthController';
import { PropertyController } from '../controllers/PropertyController';
import { DeviceController } from '../controllers/DeviceController';
import { ContentController } from '../controllers/ContentController';
import { GuestLinkController } from '../controllers/GuestLinkController';
import { BillingPlanController } from '../controllers/BillingPlanController';
import { authenticateToken, requireCompanyAdmin } from '../middleware/auth';
import { uploadPropertyImage, uploadAmenityImage } from '../middleware/upload';

interface CompanyParams {
  companySlug: string;
}

interface PropertyParams extends CompanyParams {
  propertySlug: string;
}

const router = express.Router({ mergeParams: true });
const authController = new AuthController();
const propertyController = new PropertyController();
const deviceController = new DeviceController();
const contentController = new ContentController();
const guestLinkController = new GuestLinkController();
const billingPlanController = new BillingPlanController();

// Company admin login
router.get('/login', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-login.html'));
});

router.post('/login', authController.companyLogin.bind(authController));

// Logout
router.post('/logout', authenticateToken, authController.logout.bind(authController));

// Profile
router.get('/profile', authenticateToken, authController.profile.bind(authController));

// 2026-10-03 11:39, tablet preview for company admins. Guests use paired devices at /tablet;
// the page HTML is static, and its content API now requires a company-admin JWT.
router.get('/property/:propertySlug', (req: express.Request<PropertyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/tablet-app.html'));
});

router.get('/property/:propertySlug/api/content', authenticateToken, requireCompanyAdmin, propertyController.getPropertyContent.bind(propertyController));

router.get('/property/:propertySlug/api/weather', authenticateToken, requireCompanyAdmin, propertyController.getPropertyWeather.bind(propertyController));

// Company dashboard (served without auth, JS handles auth check)
router.get('/dashboard', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-dashboard.html'));
});

// Company billing dashboard
router.get('/billing', (req: express.Request<CompanyParams>, res) => {
  res.sendFile(path.join(__dirname, '../views/company-billing.html'));
});

// Protected routes - require company admin authentication
router.use(authenticateToken, requireCompanyAdmin);

router.get('/geocode', propertyController.geocode.bind(propertyController));

// Properties management API
router.get('/properties', propertyController.getPropertiesByCompany.bind(propertyController));
router.post('/properties', propertyController.createProperty.bind(propertyController));
router.get('/properties/:propertySlug', propertyController.getProperty.bind(propertyController));
router.put('/properties/:propertySlug', propertyController.updateProperty.bind(propertyController));
router.delete('/properties/:propertySlug', propertyController.deleteProperty.bind(propertyController));

// Amenities management API
router.get('/properties/:propertySlug/amenities', propertyController.getAmenitiesByProperty.bind(propertyController));
router.post('/properties/:propertySlug/amenities', propertyController.createAmenity.bind(propertyController));
router.put('/properties/:propertySlug/amenities/:amenityId', propertyController.updateAmenity.bind(propertyController));
router.delete('/properties/:propertySlug/amenities/:amenityId', propertyController.deleteAmenity.bind(propertyController));

// 2026-10-03 22:25, G1 guide content (restaurants, videos, local info, announcements, welcome)
// NOTE: /order must be registered before /:id
router.get('/properties/:propertySlug/content', contentController.getAll.bind(contentController));
router.post('/properties/:propertySlug/content/:type', contentController.create.bind(contentController));
router.put('/properties/:propertySlug/content/:type/order', contentController.reorder.bind(contentController));
router.put('/properties/:propertySlug/content/:type/:id', contentController.update.bind(contentController));
router.delete('/properties/:propertySlug/content/:type/:id', contentController.remove.bind(contentController));
router.put('/properties/:propertySlug/welcome', contentController.setWelcome.bind(contentController));

// 2026-10-03 23:06, G3 self-serve billing (Stripe)
router.get('/billing/status', billingPlanController.status.bind(billingPlanController));
router.post('/billing/checkout', billingPlanController.checkout.bind(billingPlanController));
router.post('/billing/invoice', billingPlanController.invoice.bind(billingPlanController));
router.post('/billing/hardware', billingPlanController.hardware.bind(billingPlanController));
router.post('/billing/portal', billingPlanController.portal.bind(billingPlanController));

// 2026-10-03 22:42, G2 public phone/web guide link
router.get('/properties/:propertySlug/guest-link', guestLinkController.get.bind(guestLinkController));
router.post('/properties/:propertySlug/guest-link/rotate', guestLinkController.rotate.bind(guestLinkController));

// 2026-10-03 11:39, paired tablets per property
router.post('/properties/:propertySlug/devices/pairing-code', deviceController.createPairingCode.bind(deviceController));
router.get('/properties/:propertySlug/devices', deviceController.listDevices.bind(deviceController));
router.delete('/properties/:propertySlug/devices/:deviceId', deviceController.revokeDevice.bind(deviceController));

// 2026-10-03 12:32, direct-booking / review QR scan counts
router.get('/properties/:propertySlug/link-stats', propertyController.getLinkStats.bind(propertyController));

// Image upload API
router.post('/upload/property-image', uploadPropertyImage, propertyController.uploadPropertyImage.bind(propertyController));
router.post('/upload/amenity-image', uploadAmenityImage, propertyController.uploadAmenityImage.bind(propertyController));

// Company billing
router.get('/billing', (req: express.Request<CompanyParams>, res) => {
  const { companySlug } = req.params;
  res.json({ message: `${companySlug} Billing - Protected` });
});

// Company helpdesk
router.get('/helpdesk', (req: express.Request<CompanyParams>, res) => {
  res.json({ message: `${req.params.companySlug} Helpdesk - Protected` });
});

router.post('/helpdesk', (req: express.Request<CompanyParams>, res) => {
  res.json({ message: `Create Ticket for ${req.params.companySlug} - Protected` });
});


export = router;