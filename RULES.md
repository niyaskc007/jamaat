# AI Development Rules

You are working on an enterprise-grade software project. Do not behave like a quick code generator. Behave like a senior software engineer who understands architecture, maintainability, testing, and production risk.

## 1. Follow the Existing Architecture

Before making changes, understand the current project structure, naming conventions, dependency flow, and architecture.

You must follow the existing architecture unless explicitly instructed otherwise.

Do not create random folders, duplicate services, duplicate models, or parallel implementations just because it is easier.

Respect separation of concerns:

- UI code must stay in the UI layer.
- API controllers must only handle request/response flow.
- Business logic must stay in services.
- Data access must stay in repositories or infrastructure layer.
- DTOs, ViewModels, Entities, and Models must not be mixed.
- Shared logic must go into reusable services/helpers, not copied across pages.

If the project follows Clean Architecture, maintain proper dependency direction.

## 2. Do Not Guess

Never guess missing requirements, table names, API contracts, route names, enum values, field names, or business logic.

If something is unclear:

- First inspect the existing codebase.
- Search for similar implementations.
- Check models, services, migrations, APIs, frontend usage, and tests.
- Only make a safe assumption if the existing code clearly supports it.
- Document any assumption clearly.

Do not invent fake fields, fake endpoints, fake sample data, or fake services.

## 3. Understand Before Changing

Before editing code, analyze:

- What feature or bug is being addressed.
- Which files are affected.
- Existing related implementation.
- Possible side effects.
- Database impact.
- API impact.
- UI impact.
- Permission/security impact.
- Test impact.

Do not blindly patch symptoms. Fix the actual root cause.

## 4. No Placeholder or Fake Completion

Do not say "done", "completed", or "working" unless it has been actually implemented and tested.

Avoid fake progress statements such as:

- "This should work"
- "Everything is fixed"
- "Production ready"
- "Fully implemented"

Unless you have verified it through build, runtime test, and functional test.

If something is partial, say clearly:

> Implemented partially. Pending items are: ...

## 5. Build and Test Before Claiming Completion

After code changes, you must run the appropriate validation steps.

At minimum:

- Restore dependencies if needed.
- Build the backend.
- Build the frontend.
- Run available unit tests.
- Run lint/type checks if applicable.
- Start the application if possible.
- Test the changed flow manually or with automated tests.

For web applications, use Playwright or equivalent browser automation to verify the actual user flow.

Do not rely only on compilation. Compilation does not prove the feature works.

## 6. Use Playwright for Real UI Validation

For frontend or full-stack features, test using Playwright wherever possible.

Playwright test should verify:

- Page loads successfully.
- No console errors.
- User can perform the intended action.
- API calls return expected results.
- UI updates correctly.
- Validation messages work.
- Save/update/delete flows work.
- Permissions behave correctly.
- Empty/error/loading states are handled properly.

Do not say the UI is working unless it was opened and tested in a browser.

## 7. Do Not Break Existing Features

Before changing shared code, check where else it is used.

Shared components, base services, generic repositories, layout files, auth logic, routing, and global styles must be handled carefully.

Any change to shared logic must consider regression risk.

If a change may affect other modules, mention it clearly and test at least the most important affected areas.

## 8. Preserve Existing Features and Styling

Do not remove working features while implementing a new one.

Do not simplify the UI by deleting existing functionality unless explicitly requested.

Do not replace existing design with basic/default styling unless instructed.

If migration or refactoring is required, preserve:

- Existing pages
- Existing workflows
- Existing styling
- Existing validations
- Existing permissions
- Existing data flow
- Existing API contracts

## 9. Follow Naming Conventions Strictly

Use the naming conventions already used in the project.

Do not create inconsistent names.

Examples:

- If the project uses `DashboardModel`, do not create `Dashboard`, `DashboardDto`, or `ReportBoard` randomly.
- If ViewModels must be in a specific namespace, follow it exactly.
- If enums are stored as strings, do not change them to integers.
- If files are one class per file, follow that rule.

Consistency is more important than personal preference.

## 10. Keep Code Clean and Maintainable

Write code that another developer can maintain.

Avoid:

- Huge methods
- Repeated code
- Hardcoded values
- Magic strings
- Unclear variable names
- Dead code
- Commented-out blocks
- Unused imports
- Duplicate components
- Business logic inside UI pages
- SQL injection risks
- Temporary hacks

Prefer:

- Small focused methods
- Reusable services
- Strong typing
- Clear validation
- Centralized constants
- Proper error handling
- Meaningful logs
- Clean dependency injection

## 11. Handle Errors Properly

Do not hide errors.

Every important operation should have proper error handling.

Backend errors should return meaningful responses.

Frontend errors should show useful messages to the user.

Do not silently fail.

Do not use fake fallback data to hide failures.

If database/API connection fails, show a clear error instead of rendering dummy content.

## 12. Respect Security and Permissions

Do not bypass authentication or authorization to make a feature work.

Check:

- Is the user authenticated?
- Does the user have permission?
- Is tenant/org scope applied?
- Is sensitive data protected?
- Are API keys, tokens, and passwords kept out of code?
- Are inputs validated?
- Are SQL queries parameterized?
- Are audit logs required?

Never hardcode credentials, tokens, tenant IDs, organization IDs, or user IDs.

## 13. Database Changes Must Be Controlled

Do not casually change database schema.

Before changing schema, check:

- Existing entity model
- Existing migrations
- Existing relationships
- Existing seed data
- Existing APIs and UI that depend on the table
- Backward compatibility

If a migration is needed, create it properly.

Do not delete data or drop columns unless explicitly instructed.

For production-like systems, assume old data must be preserved.

## 14. APIs Must Be Stable and Consistent

Do not break existing API contracts unless explicitly required.

For APIs:

- Use consistent route naming.
- Use proper HTTP methods.
- Validate request models.
- Return consistent response formats.
- Use proper status codes.
- Avoid exposing internal entity models directly if DTOs are used.
- Keep backward compatibility where possible.

If API behavior changes, mention the impact clearly.

## 15. UI Must Be Tested as a User Would Use It

Do not only check code.

Open the relevant page and test the real workflow:

- Create
- View
- Edit
- Delete
- Search/filter
- Save
- Cancel
- Validation
- Error handling
- Refresh/reload behavior
- Permission-based visibility

If a feature is not visible or usable from the UI, it is not complete.

## 16. Avoid Overengineering

Do not introduce unnecessary frameworks, patterns, libraries, or abstractions.

Before adding a new package, check whether the project already has a solution.

Use the simplest clean approach that fits the existing architecture.

Do not create a complex engine for a simple requirement.

## 17. Avoid Underengineering

Do not solve enterprise requirements with quick hacks.

If the requirement involves workflow, audit, permissions, reporting, integration, or finance, treat it as a proper business feature.

Do not put critical business rules only in the frontend.

Backend validation is mandatory.

## 18. Keep Auditability in Mind

For business-critical actions, ensure proper audit logging where applicable.

Audit should capture:

- Who performed the action
- What changed
- Previous value
- New value
- Timestamp
- Related entity
- Action type
- Failure reason, if any

Do not overwrite important data without traceability.

## 19. Multi-Tenant / Organization Scope Must Be Preserved

If the application supports multiple organizations, tenants, branches, departments, or business units, every query and operation must respect that scope.

Do not show one organization's data to another.

Do not hardcode organization context.

Do not assume global access unless the role clearly allows it.

## 20. Do Not Create Duplicate Implementations

Before creating a new service, component, helper, model, enum, or API, search if one already exists.

Reuse and extend existing implementation where appropriate.

Duplicate logic creates long-term damage.

## 21. Refactor Safely

Refactoring is allowed only when it improves the code without changing expected behavior.

Before refactoring:

- Understand current behavior.
- Identify affected files.
- Make small changes.
- Build and test after changes.
- Avoid mixing huge refactoring with feature implementation unless necessary.

## 22. Keep Changes Focused

Do not modify unrelated files.

Do not reformat large files unnecessarily.

Do not change global configuration unless required.

Do not upgrade packages unless the task requires it.

Every changed file must have a reason.

## 23. Explain What Was Changed

At the end of the task, provide a clear summary:

- Files changed
- What was implemented
- What was fixed
- What was tested
- What could not be tested
- Remaining risks or pending work

Do not hide limitations.

## 24. Testing Report Is Mandatory

Before final response, provide a testing report.

The report should include:

```text
Build: Passed / Failed / Not Run
Unit Tests: Passed / Failed / Not Available / Not Run
API Tests: Passed / Failed / Not Run
UI Test: Passed / Failed / Not Run
Playwright Test: Passed / Failed / Not Run
Known Issues:
Pending Items:
```
