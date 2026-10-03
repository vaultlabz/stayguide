# StayGuide Commit Rules

## Commit Message Format

All commit messages should follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (formatting, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools
- **ci**: Changes to CI configuration files and scripts

### Scope

The scope should be the name of the module affected (e.g., auth, company, property, billing).

### Examples

```
feat(property): add image upload functionality
fix(auth): resolve JWT token expiration issue
docs(api): update endpoint documentation
refactor(company): improve data access patterns
```

## Commit Best Practices

- Keep commits small and focused on a single task
- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor" not "moves cursor")
- Reference issue numbers in the commit footer (e.g., "Fixes #123")
- Include relevant details in the commit body for complex changes
- Use git commit to create checkpoints during development

## Before Committing

- Ensure all linting passes
- Verify that tests pass
- Check that the code builds successfully
- Review changes to avoid committing unintended files

## Pull Requests

- Link related issues in the PR description
- Provide a clear summary of changes
- Include any necessary context for reviewers
- Address all review comments before merging