# StayGuide Code Review Guidelines

## Code Review Process

### Before Requesting Review

1. Ensure all tests pass
2. Verify linting passes with no errors
3. Check that the code builds successfully
4. Self-review your changes for obvious issues
5. Update documentation if necessary

### Requesting a Review

1. Create a pull request with a clear description
2. Link any related issues
3. Explain the purpose and implementation approach
4. Highlight any areas of concern or questions
5. Assign appropriate reviewers

### Review Requirements

- Every pull request must be reviewed by at least one peer
- Critical changes require review by a senior team member
- Security-related changes require additional security review
- UI/UX changes should include screenshots or recordings

## Reviewer Guidelines

### What to Look For

- **Functionality**: Does the code work as intended?
- **Design**: Is the solution well-designed and appropriate?
- **Complexity**: Is the code as simple as possible?
- **Tests**: Are there adequate tests?
- **Naming**: Are variables, functions, and classes named clearly?
- **Comments**: Is the code well-documented where needed?
- **Style**: Does the code follow project conventions?
- **Performance**: Are there any performance concerns?
- **Security**: Are there any security vulnerabilities?
- **Accessibility**: Does the UI meet accessibility standards?

### Providing Feedback

- Be specific and constructive
- Explain the reasoning behind suggestions
- Differentiate between required changes and suggestions
- Use a respectful and professional tone
- Consider alternative approaches
- Acknowledge good solutions and practices

## Responding to Reviews

- Address all comments before requesting re-review
- Explain your reasoning when disagreeing with feedback
- Thank reviewers for their input
- Make requested changes promptly

## Approval and Merging

- At least one approval is required before merging
- All blocking comments must be resolved
- Tests must pass in CI/CD pipeline
- Ensure the branch is up to date with the target branch
- Use squash merging for cleaner history when appropriate

## Post-Merge

- Verify deployment is successful
- Monitor for any issues in the environment
- Clean up related branches
- Update relevant documentation and tickets