# Working Rules

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

34. Never use a single migration to rename or drop a column in one step. The new pod always runs against the old schema (or vice versa) for some window during deploy; an in-place rename means every request in that window hits a `column not found` error and produces 500s. Use the additive pattern:
    - **Step A** (this release): `AddColumn` + code that writes to BOTH old and new, reads from new with fallback to old.
    - **Step B**: Backfill the new column from the old.
    - **Step C**: Ship the app with code that ignores the old column entirely.
    - **Step D** (next release): `DropColumn` on the old.

    This applies to: column renames, column-type changes, splitting one column into many, merging many into one. For pure adds (new nullable column, default value) the additive pattern is automatic — just `AddColumn` is fine. For pure removes (no readers left in code), `DropColumn` alone is fine.

35. Seed steps must be tenant-scoped and idempotent. `db.X.AnyAsync(predicate)` predicates must filter by `TenantId` explicitly (don't rely on the global query filter — a future change there can silently skip tenant B's defaults because tenant A's rows answered the probe). Existence checks for individual rows must match the unique index columns, not arbitrary fields (e.g. `FinancialPeriod`'s unique index is on `Name`, not `StartDate` — match `Name`). Non-idempotent seeders crashing startup is the most expensive class of bug.

---

## 5. UI/UX Completion

34. Always ensure the full UI/UX is built, not only backend logic or placeholder screens.

35. UI/UX must include complete pages, forms, buttons, validation messages, loading states, empty states, error states, success messages, and responsive behavior.

36. Always implement proper loading states, empty states, validation states, permission-denied states, failed states, and retry/recovery options where relevant.

37. Do not claim UI/UX is complete unless it has been visually checked and tested through actual frontend execution.

---

## 6. Styling, Reusability, and Design System

38. Always treat styling consistency as a platform-level concern, not a page-level concern.

39. Do not define colors, typography, spacing, shadows, borders, layout rules, max-width values, container widths, repeated font sizes, or repeated visual styles directly inline inside pages or components unless there is a justified one-off exception.

40. Do not hardcode repeated layout values such as `max-width`, page width, container width, padding, margin, gap, font size, heading size, button size, card spacing, border radius, or shadows inside individual pages or components.

41. All common styling must be managed through the approved app-level styling system, such as global CSS, theme files, design tokens, Tailwind configuration, SCSS variables, Radzen theme settings, shadcn theme configuration, or equivalent project-level styling structure.

42. Common layout rules such as page container width, content max width, form width, dashboard width, modal width, grid spacing, section spacing, and responsive breakpoints must be centralized in the app-level design system.

43. The platform must define reusable layout classes or components such as `AppPageContainer`, `AppContentWrapper`, `AppSection`, `AppGrid`, `AppCard`, `AppFormContainer`, or equivalent based on the technology stack.

44. Reusable UI styles must be extracted into shared CSS classes, theme variables, component variants, layout utilities, or shared design-system components.

45. Repeated values like `max-width: 1100px`, `1200px`, `100%`, `24px`, `32px`, or similar layout constants must be converted into named design tokens, CSS variables, theme variables, Tailwind config values, or shared layout utilities.

46. Do not duplicate the same styling across multiple pages, components, or modules. Repeated styling must be centralized and reused.

47. Do not fix styling inconsistencies by manually changing the same value page by page. First identify the repeated pattern, centralize it, then apply the shared class/component across the platform.

48. Colors, fonts, spacing, border radius, shadows, z-index values, breakpoints, and component states must follow the approved design system or app-level theme configuration.

49. Font sizes, font weights, heading styles, paragraph styles, labels, helper text, validation messages, and table text must follow a centralized typography scale.

50. All pages must use the approved typography scale instead of random page-level font sizes or inline font styling.

51. The platform must have centralized design tokens for colors, typography, spacing, radius, shadows, borders, z-index, breakpoints, layout widths, and component states.

52. Any repeated UI pattern used in more than one place must be converted into a reusable component, shared class, utility, or design-system variant.

53. Before changing styling, always check whether the issue should be fixed globally instead of locally.

54. Page-level styling is allowed only for layout-specific adjustments that are unique to that page and cannot reasonably be reused elsewhere.

55. Inline styling is allowed only for dynamic values generated at runtime, temporary debugging, or unavoidable third-party component constraints, and it must be documented or refactored before final delivery wherever possible.

56. If a page has a unique styling requirement, document why it is unique and keep only the minimum page-specific override required.

57. Do not allow disabled or overridden layout values such as disabled `max-width: 1100px` to remain scattered across pages. Either remove them properly or replace them with a centralized layout option.

58. Always perform a styling deep-dive before final UI delivery to identify inconsistent page widths, font sizes, typography hierarchy, spacing, button styles, card styles, table styles, form styles, modal styles, and dashboard layouts.

59. Before final delivery, scan the platform for inline styles, hardcoded widths, duplicated layout CSS, inconsistent typography, inconsistent button styles, inconsistent form spacing, and inconsistent page containers.

60. Before final delivery, automatically review the UI code for inline styles, duplicated CSS, inconsistent colors, hardcoded visual values, inconsistent max-width/container values, inconsistent typography, and styling that should be moved to app-level CSS, theme configuration, design tokens, or reusable layout components.

61. Automatically refactor hardcoded and duplicated styling into centralized app-level CSS, theme files, design tokens, layout components, shared classes, or reusable component variants.

62. Automatically refactor styling issues into the correct global CSS, theme, design-token, or shared component location before asking me to review.

63. The final UI review must confirm that pages follow one consistent layout system, one typography system, one spacing system, one color system, and one component styling pattern.

64. Do not claim UI/UX is complete if styling is scattered, duplicated, hardcoded, inconsistent, or not aligned with the app-level design system.

65. Do not claim the platform UI is complete if the same layout or styling problem exists across multiple pages, even if the current page looks acceptable.

66. Always prioritize reusable styling fixes over local visual patching.

67. Styling fixes must improve the platform-wide design system, not just make one screen look correct.

---

## 7. Security, Access Control, and Audit

68. Always perform a security review and fix identified security issues, including authentication, authorization, input validation, data exposure, secrets handling, API protection, and permission gaps.

69. Always check role-based access control, permissions, tenant/org scoping, ownership rules, and data isolation before marking work complete.

70. Always check audit logging and history tracking where the feature changes business-critical data, approvals, financial data, user access, configuration, or workflow state.

---

## 8. Performance and Maintainability

71. Always check performance impact, including unnecessary database queries, N+1 queries, missing pagination, missing indexes, large payloads, slow UI rendering, and inefficient loops.

72. Always perform code review and fix code quality, structure, naming, duplication, reusability, maintainability, and architecture issues before final delivery.

73. Always perform proper QC before declaring any task completed.

74. Always check whether new code can be generalized, reused, simplified, or extracted into shared services, shared components, helpers, utilities, base classes, interfaces, extension methods, or configuration-driven patterns.

75. Do not copy-paste business logic, UI logic, validation logic, mapping logic, API handling logic, styling logic, or repeated query logic across files.

76. If similar logic exists in more than one place, refactor it into a reusable and maintainable structure.

77. Reusability must not break readability, performance, security, or architecture. Do not over-engineer generic abstractions without real repeated use.

78. Shared code must be placed in the correct shared/common layer, not randomly inside a feature page, controller, or component.

79. Do not create reusable code that bypasses architecture boundaries or introduces hidden coupling between unrelated modules.

80. Before final delivery, review the implementation for duplicate logic, repeated UI patterns, repeated validation rules, repeated API calls, repeated mapping code, repeated styling, and repeated constants.

81. Automatically refactor duplicated or reusable logic before asking me to test or review.

---

## 9. Testing and Verification

82. Always update or create relevant tests, including unit tests, integration tests, API tests, UI tests, and regression tests based on the scope of the change.

83. Always test the frontend using proper browser-based testing tools such as Playwright or equivalent.

84. Frontend tests must verify real user flows, navigation, form submissions, validations, permissions, error handling, and expected UI behavior.

85. If frontend tests fail, automatically investigate, fix the issues, and rerun the tests until the flow passes.

86. Always run build, lint, type-checking, formatting, tests, migrations, and frontend validation before asking me to review.

87. Do not ask me to test until the implementation has passed architecture review, QC, code review, security review, UI/UX validation, styling review, reusability review, and frontend testing.

88. Do not claim “all done” unless QC, code review, security review, UI/UX validation, styling review, reusability review, and frontend testing are completed and issues are fixed.

89. Do not mark anything as completed unless it has been implemented and verified.

90. Do not claim completion based only on code changes. Completion requires implementation, review, testing, verification, and documented evidence.

---

## 10. Final Delivery

91. Always provide a final evidence-based completion report showing what was changed, what was tested, what passed, what failed, what was fixed, and what remains risky.

92. Final delivery must include the full completed scope, implementation summary, completed task list, pending or failed items if any, testing performed, and known risks or limitations.