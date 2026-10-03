# Guest Reporting System Proposal

**Date**: October 4, 2025  
**Status**: Proposal Phase  
**Author**: Development Team  

## Problem Statement

The StayGuide tablet app currently provides guests with property information but lacks a way for guests to report issues or request services. Guests need to be able to report:

- **Maintenance Issues**: Leaks, broken equipment, HVAC problems, electrical issues
- **Supply Needs**: Toilet paper, soap, towels, coffee pods, cleaning supplies
- **Housekeeping Requests**: Additional cleaning, laundry service, fresh linens
- **Amenity Problems**: Pool/hot tub issues, WiFi connectivity, equipment malfunctions
- **Service Requests**: Noise complaints, general assistance, special requests

## Proposed Solution

### Architecture Overview

The solution integrates seamlessly with the existing StayGuide architecture by following established patterns and adding minimal new components.

### Database Design

**New Table: `guest_reports`**
```sql
CREATE TABLE guest_reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    guest_name VARCHAR(255),
    guest_room VARCHAR(50),
    guest_phone VARCHAR(50),
    category ENUM('maintenance', 'supplies', 'housekeeping', 'amenities', 'wifi_tech', 'noise_complaint', 'other') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    status ENUM('new', 'acknowledged', 'in_progress', 'resolved', 'closed') DEFAULT 'new',
    location VARCHAR(255),
    urgency_level ENUM('not_urgent', 'same_day', 'immediate') DEFAULT 'not_urgent',
    guest_ip VARCHAR(45),
    resolved_at TIMESTAMP NULL,
    resolved_by INT NULL,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id)
);
```

**Rationale**: Separate table from `helpdesk_tickets` because guests are not authenticated users and have different data requirements.

### Backend Components

#### 1. ReportService (`src/services/ReportService.ts`)
- **Purpose**: Handle CRUD operations for guest reports
- **Features**: 
  - Create new guest reports
  - Retrieve reports by property
  - Update report status
  - Mock implementation for testing
- **Follows**: Existing service patterns (PropertyService, CompanyService)

#### 2. ReportController (`src/controllers/ReportController.ts`)
- **Purpose**: Handle HTTP requests for reporting functionality
- **Endpoints**:
  - `POST /company/{slug}/property/{property}/report` - Guest submission (public)
  - `GET /company/{slug}/property/{property}/reports` - View reports (authenticated)
  - `PUT /company/{slug}/reports/{id}/status` - Update report status
- **Follows**: Existing controller patterns (PropertyController)

### Frontend Integration

#### 1. New UI Card: "Report an Issue"
- **Location**: Added to existing card grid in tablet app
- **Design**: Matches existing card styling and layout
- **Icon**: 🛠️ or 📝 for visual consistency

#### 2. Report Form Modal
- **Categories**: Visual icon-based selection
  - 🔧 **Maintenance** (Plumbing, Electrical, HVAC)
  - 🧴 **Supplies** (Toiletries, Linens, Kitchen items)
  - 🧹 **Housekeeping** (Cleaning, Laundry service)
  - ⭐ **Amenities** (Pool, Hot tub, WiFi)
  - 📢 **Other** (Noise, General requests)

- **Form Fields**:
  - Category (required)
  - Issue Title (required)
  - Description (required)
  - Location (optional)
  - Urgency Level (optional)
  - Guest Name (optional)
  - Room/Unit (optional)
  - Phone (optional)

#### 3. CSS Styling
- **File**: `public/css/tablet-app.css` (extend existing)
- **Components**: Modal overlay, form styling, category buttons
- **Design**: Consistent with existing card and form patterns

### User Experience Flow

1. **Guest Access**: Guest taps "Report an Issue" card on tablet
2. **Category Selection**: Visual icons for quick category selection
3. **Form Completion**: Simple form with smart defaults
4. **Submission**: One-tap submit with confirmation
5. **Confirmation**: Success message with reference number
6. **Management**: Property managers see reports in dashboard

### Technical Implementation

#### Routes Addition (`src/routes/company.ts`)
```typescript
// Add to existing company routes
router.post('/property/:propertySlug/report', reportController.submitGuestReport.bind(reportController));
router.get('/property/:propertySlug/reports', authenticateToken, reportController.getPropertyReports.bind(reportController));
```

#### Mock Database Integration
- Extends existing mock database pattern
- Sample data for testing
- Seamless switching between mock and real database

### Integration Benefits

#### Minimal Changes Required
- **New Files**: 2 (ReportService, ReportController)
- **Modified Files**: 3 (company routes, tablet HTML, CSS)
- **Database**: 1 new table
- **No Breaking Changes**: Existing functionality unaffected

#### Follows Established Patterns
- Uses existing company/property slug routing
- Leverages current service/controller architecture
- Maintains multi-tenant data isolation
- Supports mock database testing

#### Seamless UI Integration
- Fits existing card-based layout
- Uses established styling patterns
- Maintains responsive design
- Consistent with current UX

### Security Considerations

- **Rate Limiting**: Prevent spam submissions
- **Input Validation**: Sanitize all user inputs
- **IP Tracking**: Log guest IP for analytics/abuse prevention
- **No Authentication**: Public endpoint appropriate for guest use

### Testing Strategy

- **Mock Database**: Test all functionality without MySQL
- **API Testing**: Validate all endpoints and error handling
- **UI Testing**: Ensure responsive design and form validation
- **Integration Testing**: End-to-end guest reporting workflow

### Future Enhancements

- **Email Notifications**: Alert property managers of urgent reports
- **Photo Uploads**: Allow guests to attach images
- **Status Updates**: SMS/email updates to guests
- **Analytics Dashboard**: Report trends and response times

## Implementation Plan

### Phase 1: Backend Foundation
1. Create `guest_reports` table schema
2. Implement `ReportService` with mock data
3. Create `ReportController` with endpoints
4. Add routes to company router
5. Test API endpoints

### Phase 2: Frontend Integration
1. Add "Report an Issue" card to tablet app
2. Create report form modal
3. Add CSS styling for new components
4. Implement form submission JavaScript
5. Test complete user flow

### Phase 3: Testing & Refinement
1. Comprehensive testing of all functionality
2. UI/UX refinements based on testing
3. Performance optimization
4. Documentation updates

## Success Metrics

- **Functionality**: All report categories work correctly
- **Usability**: Guests can submit reports in under 2 minutes
- **Integration**: No impact on existing tablet app performance
- **Management**: Property managers can view and manage reports
- **Scalability**: System handles multiple concurrent submissions

## Risk Mitigation

- **Spam Prevention**: Rate limiting and input validation
- **Database Performance**: Proper indexing on frequently queried fields
- **UI Consistency**: Follow existing design patterns strictly
- **Testing Coverage**: Comprehensive mock database testing

---

**Next Steps**: Upon approval, proceed with Phase 1 implementation following the established development protocols and coding standards.
