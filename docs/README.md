# StayGuide SaaS Platform Documentation

This repository contains the documentation for the StayGuide multi-tenant SaaS platform for rental property management.

## Project Overview

StayGuide is a feature-complete SaaS platform that enables property rental companies to manage their properties and provide a tablet-based guest experience. The platform includes:

- Multi-tenant architecture supporting multiple companies
- Property management with amenities and image support
- Guest-facing tablet interface for property information
- Admin dashboard for company management
- Image processing with Sharp optimization

## Technical Stack

- **Backend**: Node.js v20.x, Express.js, TypeScript
- **Database**: MySQL (with mock database option)
- **Authentication**: JWT-based with role-based access control
- **Image Processing**: Sharp library for optimization
- **File Uploads**: Multer middleware

## Documentation

### Project Guidelines
- [Coding Standards](coding_standards.md)
- [Commit Rules](commit_rules.md)
- [Branching Strategy](branching_strategy.md)
- [Code Review](code_review.md)
- [Testing Guidelines](testing_guidelines.md)

### Project History & Development
- [Changelog](CHANGELOG.md) - Comprehensive project history and features
- [Development Plan](todo.md) - Detailed development history with change logs

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables (see `.env.example`)
4. Start development server: `npm run dev`
5. Build for production: `npm run build`

## Test Credentials

- **Admin**: admin@stayguide.com / admin123
- **Company**: admin@demorentals.com / demo123

## Key URLs

- Admin Dashboard: `/admin/dashboard`
- Company Dashboard: `/company/{slug}/dashboard`
- Tablet App: `/company/{slug}/property/{property}`