# StayGuide Branching Strategy

## Branch Structure

The StayGuide project follows a trunk-based development approach with the following branch structure:

- **main**: Production-ready code that has been tested and approved
- **develop**: Integration branch for features before production release
- **feature/**: Feature branches for new functionality
- **bugfix/**: Bug fix branches for resolving issues
- **hotfix/**: Emergency fixes for production issues
- **release/**: Preparation branches for upcoming releases

## Branch Naming Conventions

- Feature branches: `feature/feature-name` (e.g., `feature/image-upload`)
- Bug fix branches: `bugfix/issue-description` (e.g., `bugfix/login-validation`)
- Hotfix branches: `hotfix/issue-description` (e.g., `hotfix/security-vulnerability`)
- Release branches: `release/version` (e.g., `release/1.2.0`)

## Workflow

### Feature Development

1. Create a feature branch from `develop`:
   ```
   git checkout develop
   git pull
   git checkout -b feature/feature-name
   ```

2. Develop the feature with regular commits following commit rules
3. Push the branch to remote:
   ```
   git push -u origin feature/feature-name
   ```

4. Create a pull request to merge into `develop`
5. After code review and approval, merge into `develop`

### Bug Fixes

1. Create a bugfix branch from `develop`:
   ```
   git checkout develop
   git pull
   git checkout -b bugfix/issue-description
   ```

2. Fix the bug with appropriate commits
3. Create a pull request to merge into `develop`

### Hotfixes

1. Create a hotfix branch from `main`:
   ```
   git checkout main
   git pull
   git checkout -b hotfix/issue-description
   ```

2. Fix the issue with appropriate commits
3. Create pull requests to merge into both `main` and `develop`

### Releases

1. Create a release branch from `develop`:
   ```
   git checkout develop
   git pull
   git checkout -b release/version
   ```

2. Make any final adjustments and version bumps
3. Create a pull request to merge into `main`
4. After merging to `main`, tag the release:
   ```
   git checkout main
   git pull
   git tag -a v1.2.0 -m "Release version 1.2.0"
   git push origin v1.2.0
   ```

5. Merge `main` back into `develop`

## Branch Cleanup

- Delete feature, bugfix, and hotfix branches after they are merged
- Keep `main`, `develop`, and active release branches