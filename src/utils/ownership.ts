// 2026-10-03 22:25, shared: resolve /company/:companySlug/properties/:propertySlug and enforce company ownership
import { Response } from 'express';
import { AuthRequest, Property } from '../types';
import { CompanyService } from '../services/CompanyService';
import { PropertyService } from '../services/PropertyService';

const companyService = new CompanyService();
const propertyService = new PropertyService();

/** Returns the property, or sends 404/403 itself and returns null. */
export async function resolveOwnedProperty(req: AuthRequest, res: Response): Promise<Property | null> {
  const { companySlug, propertySlug } = req.params;

  const company = await companyService.findBySlug(companySlug);
  if (!company) {
    res.status(404).json({ error: 'Company not found' });
    return null;
  }

  if (req.user?.role === 'company_admin' && req.user.company_id !== company.id) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  const property = await propertyService.findBySlug(company.id, propertySlug);
  if (!property) {
    res.status(404).json({ error: 'Property not found' });
    return null;
  }
  return property;
}
