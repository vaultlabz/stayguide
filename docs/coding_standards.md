# StayGuide Coding Standards

## General Principles

- Think minimalistic; always prefer simple solutions
- Avoid code duplication; check for existing similar functionality
- Only make requested changes or changes you fully understand
- Keep code clean and organized
- Use comments to explain complex logic
- Use error logs to troubleshoot functionality
- Break code into multiple, single-purpose functions
- Prioritize modularity and the Single Responsibility Principle
- Variable and function names should accurately describe their purpose

## TypeScript Standards

- All code must be written in TypeScript
- Use proper type definitions for all variables, parameters, and return values
- Avoid using `any` type unless absolutely necessary
- Use interfaces for defining data structures
- Follow consistent naming conventions:
  - PascalCase for classes, interfaces, and types
  - camelCase for variables, functions, and methods
  - UPPER_CASE for constants

## Backend (Node.js) Standards

- Implement robust input validation for all incoming requests
- Handle errors gracefully and centrally with meaningful messages
- Ensure proper authentication and authorization mechanisms
- Make no changes to existing code and models
- For any changes, introduce new routes, controllers, and services
- Rate limit API endpoints to prevent abuse
- Enable CAPTCHA where appropriate for security

## Frontend Standards

- Use material design principles
- Create reusable components for specific UI elements
- Structure folders logically (features, services, models, providers)
- Limit file size to 300 lines of code; refactor when needed
- Always update frontend links/buttons when implementing new features

## File Organization

- Place one-off scripts in the dedicated 'scripts' folder
- Categorize folders based on functionality
- Keep related functionality together
- Follow the established project structure

## Database Practices

- Use proper indexing for frequently queried fields
- Maintain data integrity with appropriate constraints
- Ensure multi-tenant data isolation
- Follow the established schema design