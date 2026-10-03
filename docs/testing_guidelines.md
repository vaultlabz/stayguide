# StayGuide Testing Guidelines

## Testing Philosophy

The StayGuide platform follows a comprehensive testing approach to ensure reliability, security, and performance. All code changes should be thoroughly tested before deployment.

## Testing Types

### Unit Testing

- Write unit tests for all new code
- Focus on testing individual functions and components in isolation
- Mock external dependencies and services
- Aim for high code coverage (minimum 80%)
- Use Jest for JavaScript/TypeScript testing

### Integration Testing

- Test interactions between different components
- Verify API endpoints function correctly
- Test database operations with test databases
- Ensure authentication and authorization work properly
- Test file upload and image processing functionality

### End-to-End Testing

- Test complete user workflows
- Verify critical paths function as expected
- Test across different environments (development, staging, production)
- Include mobile and tablet responsive testing

### Mock Database Testing

- Use the mock database mode (MOCK_DATABASE=true) for testing without MySQL
- Verify all CRUD operations work with mock services
- Test with sample data provided in mock services
- Ensure mock mode accurately simulates real database behavior

## Testing Best Practices

- Write tests before or alongside code (TDD approach when possible)
- Keep tests simple, focused, and readable
- Use descriptive test names that explain the expected behavior
- Organize tests to mirror the structure of the code being tested
- Avoid test interdependencies
- Clean up test data after tests complete
- Use appropriate assertions for different test scenarios
- Run tests locally before pushing code

## Test Credentials

Use these credentials for testing:
- **Admin**: admin@stayguide.com / admin123
- **Company**: admin@demorentals.com / demo123

## Testing Environment

- Configure testing environment with `.env.test` file
- Use separate test database to avoid affecting development data
- Set up CI/CD pipeline to run tests automatically
- Ensure tests are idempotent (can be run multiple times with the same result)

## Test Coverage

- Monitor test coverage with appropriate tools
- Focus on testing critical paths and complex logic
- Address coverage gaps in high-risk areas
- Generate coverage reports as part of the build process

## Performance Testing

- Test image processing performance with various file sizes
- Verify API response times under different loads
- Test multi-tenant isolation with concurrent requests
- Ensure database queries are optimized

## Security Testing

- Test authentication mechanisms thoroughly
- Verify proper authorization for all endpoints
- Test for common vulnerabilities (XSS, CSRF, SQL injection)
- Validate input sanitization and file upload security