# StayGuide Development Guidelines

## Core Development Principles

1. **THINK MINIMALISTIC** - Always prefer simple solutions over complex ones
2. **AVOID DUPLICATION** - Check if similar functionality already exists
3. **BE CAREFUL** - Only make changes that are requested or well understood
4. **LOG EVERYTHING** - Document all changes in `docs/todo.md` with detailed explanations
5. **MAINTAIN ISOLATION** - Avoid breaking existing functionality
6. **FOLLOW PATTERNS** - Maintain consistent code style and architecture

## Folder Structure

```
/
├── src/                 # Source code
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── models/          # Data models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   └── views/           # HTML templates
├── public/              # Static assets
│   └── uploads/         # Uploaded images
├── dist/                # Compiled JavaScript
├── docs/                # Documentation
│   ├── CHANGELOG.md     # Project history
│   ├── todo.md          # Development history
│   └── ...              # Other documentation
├── scripts/             # Utility scripts
└── database/            # Database scripts and schema
```

## Development Workflow

1. **Understand the request** - Make sure you fully understand what's being asked
2. **Check existing code** - Look for similar functionality or patterns
3. **Plan your approach** - Consider the best way to implement the change
4. **Make the change** - Implement the solution with clean, maintainable code
5. **Test thoroughly** - Ensure your change works as expected
6. **Document the change** - Update documentation and add detailed notes to `docs/todo.md`

## Error Handling

- Use try/catch blocks for async operations
- Provide meaningful error messages
- Log errors for debugging
- Return appropriate HTTP status codes
- Validate input data thoroughly

## Testing

- Test all new functionality thoroughly
- Consider edge cases and error scenarios
- Test with both mock and real database modes
- Verify UI changes in different browsers/devices
- Check for performance impacts

## Documentation

### Required `docs/todo.md` Entry Format

```markdown
## [DATE] - [CHANGE_TYPE]: Brief Description

**What Changed:**
- ✅ Detailed change 1
- ✅ Detailed change 2
- ✅ Detailed change 3

**Why:**
- Reason 1 for making this change
- Reason 2 for making this change
- Reason 3 for making this change

**How:**
- Technical approach 1
- Technical approach 2
- Technical approach 3

**Impact:**
- **Benefit 1**: Detailed explanation
- **Benefit 2**: Detailed explanation
- **Benefit 3**: Detailed explanation

**Technical Details:**
- Specific implementation detail 1
- Specific implementation detail 2
- Specific implementation detail 3
```

## Code Style

- Use TypeScript for all new code
- Follow consistent naming conventions
- Use meaningful variable and function names
- Keep functions small and focused
- Add comments for complex logic
- Use proper indentation and formatting

## Deployment

1. Build TypeScript to JavaScript:
```bash
npm run build
```

2. Copy views to dist folder:
```bash
npm run build:clean
```

3. Update docs/CHANGELOG.md:
```bash
# 3. Update docs/todo.md
echo "## $(date) - [CHANGE]: Description" >> docs/todo.md
```

4. Deploy to server:
```bash
npm start
```

## Handling Uncertainty

If you're unsure about how to implement a feature:

1. **Research** - Look for similar implementations in the codebase
2. **Document the uncertainty** in docs/todo.md
3. **Propose alternatives** - Suggest multiple approaches
4. **Ask for clarification** - If needed, request more information

## Quality Checklist

- ✅ Code follows TypeScript best practices
- ✅ No duplicate functionality
- ✅ Proper error handling
- ✅ Input validation
- ✅ Consistent with existing patterns
- ✅ Detailed docs/todo.md entry
- ✅ Tests pass
- ✅ No console errors
- ✅ Responsive design (if UI changes)
- ✅ Security considerations addressed