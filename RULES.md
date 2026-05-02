# Working Rules

These rules govern every batch of work delivered against this codebase. They override convenience or speed.

## 1. Planning and Task Tracking

1. Always understand the existing requirement, codebase, architecture, folder structure, naming conventions, dependencies, and implemented patterns before making changes.
2. Always convert every requested item into a clear, detailed to-do list before starting execution.
3. Each to-do item must include enough detail to make the expected outcome, implementation scope, and completion criteria clear.
4. Keep the to-do list continuously updated throughout the work, marking items as pending, in progress, completed, blocked, or failed.
5. Always maintain clear visibility of what has been completed, what is currently being worked on, and what is still pending.
6. Continue working through all dependent tasks until the full requested scope is completed, not just the first visible issue.
7. Do not stop midway unless there is a real blocker that cannot be resolved without my input.
8. If a blocker occurs, clearly explain what is blocked, why it is blocked, what was already attempted, and what exact input is required from me.
9. Do not ask me to review or confirm after every small step, phase, or partial implementation.
10. My review should be requested only once, after all planned phases, waves, and related tasks are fully completed.
11. Do not provide partial delivery as final output.
12. Do not silently reduce scope, skip edge cases, or replace requested behavior with a simpler shortcut.

---

## 2. Requirement and Codebase Understanding

13. Do not guess missing requirements, missing files, APIs, models, database structure, routes, or business logic. Inspect the existing implementation first and make decisions based on evidence.
14. Always keep implementation aligned with the original business requirement.
15. Do not create duplicate models, services, DTOs, ViewModels, components, pages, APIs, repositories, utilities, constants, or enums when an existing reusable implementation already exists.
16. Always reuse existing shared components, helpers, services, validators, constants, enums, themes, layouts, and design patterns wherever applicable.
17. Do not hardcode IDs, tenant IDs, organization IDs, URLs, credentials, role names, status values, magic strings, or configuration values unless explicitly approved.
18. All configuration values must be placed in the correct configuration layer, environment file, database setting, options class, or secrets store as per the project architecture.

---

## 3. Architecture and Layering

19. Always respect the agreed solution hierarchy, dependency direction, project separation, naming conventions, namespace rules, and clean architecture boundaries.
20. Ensure all models, DTOs, ViewModels, entities, services, repositories, interfaces, validators, controllers, pages, and components are placed in their correct projects, folders, namespaces, and layers.
21. Controllers must not directly call the database, DbContext, repositories, or low-level data access logic unless the approved architecture explicitly allows it.
22. Controllers must only handle request routing, input validation coordination, authorization checks, response shaping, and delegation to the correct service/application layer.
23. Business logic must stay in the service/application layer, not inside controllers, UI components, repositories, or database scripts.
24. Data access logic must stay inside the repository/infrastructure layer, not inside controllers, UI pages, components, or services that should remain persistence-agnostic.
25. UI components/pages must not directly call the database or bypass the approved API/service layer.
26. Automatically review the implementation for architecture violations, misplaced files, wrong namespaces, direct database access, duplicated logic, hardcoded dependencies, and broken layering.
27. Automatically fix architecture, hierarchy, and layering violations before asking me to test or review anything.
28. Do not mark the task as complete if the architecture is technically working but structurally wrong. Functionality alone is not enough; the implementation must follow the approved architecture.

---

## 4. Database, API, and Integration Quality

29. Always validate database changes, migrations, seed data, indexes, relationships, constraints, nullable fields, delete behavior, and backward compatibility before final delivery.
30. Always ensure API contracts are complete, consistent, version-safe, documented, and aligned with frontend usage.
31. Always check integration points, external APIs, background jobs, queues, webhooks, scheduled tasks, and retry behavior if the change touches connected systems.
32. Never hide real failures using dummy data, fallback data, fake success messages, placeholder screens, or silent exception handling.
33. Always handle errors properly with user-friendly messages on the frontend and safe technical logging on the backend.

---

## 5. UI/UX Completion

34. Always ensure the full UI/UX is built, not only backend logic or placeholder screens.
35. UI/UX must include complete pages, forms, buttons, validation messages, loading states, empty states, error states, success messages, and responsive behavior.
36. Always implement proper loading states, empty states, validation states, permission-denied states, failed states, and retry/recovery options where relevant.
37. Do not claim UI/UX is complete unless it has been visually checked and tested through actual frontend execution.

---

## 6. Security, Access Control, and Audit

38. Always perform a security review and fix identified security issues, including authentication, authorization, input validation, data exposure, secrets handling, API protection, and permission gaps.
39. Always check role-based access control, permissions, tenant/org scoping, ownership rules, and data isolation before marking work complete.
40. Always check audit logging and history tracking where the feature changes business-critical data, approvals, financial data, user access, configuration, or workflow state.

---

## 7. Performance and Maintainability

41. Always check performance impact, including unnecessary database queries, N+1 queries, missing pagination, missing indexes, large payloads, slow UI rendering, and inefficient loops.
42. Always perform code review and fix code quality, structure, naming, duplication, maintainability, and architecture issues before final delivery.
43. Always perform proper QC before declaring any task completed.

---

## 8. Testing and Verification

44. Always update or create relevant tests, including unit tests, integration tests, API tests, UI tests, and regression tests based on the scope of the change.
45. Always test the frontend using proper browser-based testing tools such as Playwright or equivalent.
46. Frontend tests must verify real user flows, navigation, form submissions, validations, permissions, error handling, and expected UI behavior.
47. If frontend tests fail, automatically investigate, fix the issues, and rerun the tests until the flow passes.
48. Always run build, lint, type-checking, formatting, tests, migrations, and frontend validation before asking me to review.
49. Do not ask me to test until the implementation has passed architecture review, QC, code review, security review, UI/UX validation, and frontend testing.
50. Do not claim "all done" unless QC, code review, security review, UI/UX validation, and frontend testing are completed and issues are fixed.
51. Do not mark anything as completed unless it has been implemented and verified.
52. Do not claim completion based only on code changes. Completion requires implementation, review, testing, verification, and documented evidence.

---

## 9. Final Delivery

53. Always provide a final evidence-based completion report showing what was changed, what was tested, what passed, what failed, what was fixed, and what remains risky.
54. Final delivery must include the full completed scope, implementation summary, completed task list, pending or failed items if any, testing performed, and known risks or limitations.

---

## 10. Styling and Design System

55. Do not define colors, typography, spacing, shadows, borders, layout rules, or repeated visual styles directly inline inside pages or components unless there is a justified one-off exception.
56. All common styling must be managed through the approved app-level styling system, such as global CSS, theme files, design tokens, Tailwind configuration, SCSS variables, Radzen theme settings, shadcn theme configuration, or equivalent project-level styling structure.
57. Reusable UI styles must be extracted into shared CSS classes, theme variables, component variants, layout utilities, or shared design-system components.
58. Do not duplicate the same styling across multiple pages, components, or modules. Repeated styling must be centralized and reused.
59. Colors, fonts, spacing, border radius, shadows, z-index values, breakpoints, and component states must follow the approved design system or app-level theme configuration.
60. Page-level styling is allowed only for layout-specific adjustments that are unique to that page and cannot reasonably be reused elsewhere.
61. Inline styling is allowed only for dynamic values generated at runtime, temporary debugging, or unavoidable third-party component constraints, and it must be documented or refactored before final delivery wherever possible.
62. Before final delivery, automatically review the UI code for inline styles, duplicated CSS, inconsistent colors, hardcoded visual values, and styling that should be moved to app-level CSS or theme configuration.
63. Automatically refactor styling issues into the correct global CSS, theme, design-token, or shared component location before asking me to review.
64. Do not claim UI/UX is complete if styling is scattered, duplicated, hardcoded, inconsistent, or not aligned with the app-level design system.
