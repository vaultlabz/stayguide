# StayGuide Project Rules

## Mandatory Rules

- Everything must be written in TypeScript
- Make no changes to existing code and models
- For any changes, introduce new routes, controllers, and services
- Always update all relevant frontend links and buttons to point to the correct page (not API endpoints) when implementing new features

## Documentation

All project documentation is maintained in the `/docs` directory:

### Core Documentation
- [Project Documentation](docs/README.md) - Overview of the StayGuide platform
- [Coding Standards](docs/coding_standards.md) - Code style and best practices
- [Commit Rules](docs/commit_rules.md) - Git commit message guidelines
- [Branching Strategy](docs/branching_strategy.md) - Git workflow and branch management
- [Code Review](docs/code_review.md) - Pull request and review process
- [Testing Guidelines](docs/testing_guidelines.md) - Testing practices and requirements

### Development History & Status
- [Development History](docs/todo.md) - Complete development log and project status
- [Changelog](docs/CHANGELOG.md) - Comprehensive project changelog

### ✅ Recent Major Implementation (October 4, 2025)
- [Integration Proposal](docs/integrated-solution-proposal.md) - Guest Reporting + Super Admin Amenities Control architecture
- [Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md) - Complete implementation documentation
- **Status**: ✅ **FULLY OPERATIONAL** - Both systems integrated and working seamlessly

## General Coding Principles

- Think minimalistic; always prefer simple solutions
- Avoid code duplication when possible
- Only make changes that are requested or well understood
- Keep code clean and organized
- Use comments to explain complex logic
- Use error logs often to troubleshoot functionality
- Break things up into multiple, single-purpose functions
- Prioritize modularity and the Single Responsibility Principle
- Use descriptive variable and function names

## Technical Stack

- Backend: Node.js with TypeScript
- Frontend: HTML5, JavaScript, Tailwind, Flutter
- Database: MySQL with mock database option
- Authentication: JWT-based with role-based access control
- Image Processing: Sharp library for optimization

## Development Protocol

---

### /propose <Solution>

When asked to propose a solution, create a **Markdown file** (`.md`) detailing the plan. This file must be saved in the **`/docs`** directory *before* executing any code changes.

### /launch

1.  Review all running processes.
2.  Remove any redundant or unnecessary processes.
3.  Launch the application's **front-end** and **back-end** components.

### /doc

This command triggers a comprehensive assessment of the project's current status, including:

* **Rationale:** A summary of what's currently being done and the reasoning behind it (the **why**).
* **Decision History:** A review of the conversations and context that led to the current decisions or changes.
* **Progress Report:** A clear statement of **what was done** and **what remains to be done**.
* **Timestamp:** The assessment will be appended with the current date and time.