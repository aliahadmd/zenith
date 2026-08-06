# Form and Input Components

<cite>
**Referenced Files in This Document**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [DiscoveryCategoryPicker.tsx](file://src/react-app/components/DiscoveryCategoryPicker.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [form.tsx](file://src/react-app/components/ui/form.tsx)
- [posts.ts](file://src/react-app/lib/posts.ts)
- [discovery.ts](file://src/react-app/lib/discovery.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document provides comprehensive documentation for the form and input components that power user interactions and data entry across the application. It focuses on:
- ShortPostComposer: quick post creation with rich content, images, polls, and scheduling
- ScheduleDialog: scheduling publication time for existing posts
- ReportDialog: reporting content with reason and optional details
- SaveButton: optimistic save-to-library toggle with rollback
- DiscoverySettingsPanel and DiscoveryCategoryPicker: discovery preferences and category selection

The guide explains validation patterns using Zod and React Hook Form, state management strategies, accessibility compliance, error handling, and integration points with TanStack Query and toast notifications.

## Project Structure
The relevant UI components live under src/react-app/components, with shared schemas under src/react-app/lib and reusable form primitives under src/react-app/components/ui. Data access is centralized via lib modules (posts.ts, discovery.ts).

```mermaid
graph TB
subgraph "Components"
SPC["ShortPostComposer.tsx"]
SD["ScheduleDialog.tsx"]
RD["ReportDialog.tsx"]
SB["SaveButton.tsx"]
DSP["DiscoverySettingsPanel.tsx"]
DCP["DiscoveryCategoryPicker.tsx"]
end
subgraph "UI Primitives"
FORM["ui/form.tsx"]
end
subgraph "Libraries"
SCH["schemas.ts"]
POSTS["posts.ts"]
DISC["discovery.ts"]
end
SPC --> FORM
SPC --> SCH
SPC --> POSTS
SD --> POSTS
RD --> POSTS
SB --> POSTS
DSP --> DISC
DCP --> DISC
```

**Diagram sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [DiscoveryCategoryPicker.tsx](file://src/react-app/components/DiscoveryCategoryPicker.tsx)
- [form.tsx](file://src/react-app/components/ui/form.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [posts.ts](file://src/react-app/lib/posts.ts)
- [discovery.ts](file://src/react-app/lib/discovery.ts)

**Section sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [DiscoveryCategoryPicker.tsx](file://src/react-app/components/DiscoveryCategoryPicker.tsx)
- [form.tsx](file://src/react-app/components/ui/form.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [posts.ts](file://src/react-app/lib/posts.ts)
- [discovery.ts](file://src/react-app/lib/discovery.ts)

## Core Components
- ShortPostComposer: A dialog-based composer for creating or editing short posts with text, image attachments, and polls. Supports immediate publish or scheduling. Uses React Hook Form with Zod resolver for validation, TanStack Query mutations for persistence, and toast feedback.
- ScheduleDialog: A focused dialog to set or update a publication datetime for an existing post. Validates minimum future time and converts local datetime to UTC ISO string before saving.
- ReportDialog: A modal to report content by selecting a reason and optionally adding details. Submits via mutation and shows success/error toasts.
- SaveButton: An icon button toggling “save to library” with optimistic UI updates and rollback on failure. Invalidates related queries on success.
- DiscoverySettingsPanel: Loads user’s discovery preferences and allows updating interests and creator categories independently. Integrates with DiscoveryCategoryPicker.
- DiscoveryCategoryPicker: Accessible multi-select component enforcing maximum selections and providing aria-pressed states.

Key patterns:
- Validation: Zod schemas define field-level and cross-field rules; React Hook Form enforces them at submit time.
- State: Local state for transient UI (e.g., scheduledLocal), controlled inputs where appropriate, and query cache for server state.
- Feedback: Toast messages for success and errors; inline FormMessage for validation errors.
- Accessibility: Labels, aria attributes, keyboard support via shadcn dialogs, and semantic roles.

**Section sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [DiscoveryCategoryPicker.tsx](file://src/react-app/components/DiscoveryCategoryPicker.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [form.tsx](file://src/react-app/components/ui/form.tsx)

## Architecture Overview
The components follow a consistent architecture:
- UI layer: Dialogs and forms built with shadcn primitives and React Hook Form.
- Validation layer: Zod schemas ensure type safety and constraints.
- Mutation layer: TanStack Query mutations handle async operations and cache invalidation.
- Feedback layer: Sonner toasts provide user feedback.

```mermaid
sequenceDiagram
participant U as "User"
participant C as "ShortPostComposer"
participant F as "React Hook Form"
participant M as "Mutation (create/update)"
participant Q as "Query Client"
participant API as "API (/api/posts)"
U->>C : Open composer and fill fields
C->>F : Bind fields and validate (Zod)
U->>C : Submit
C->>F : handleSubmit(values)
C->>M : mutateAsync({ values, scheduledFor? })
M->>API : POST/PATCH (FormData or JSON)
API-->>M : Success response
M->>Q : Invalidate feed/schedules/drafts
M-->>C : onSuccess
C->>U : Show success toast and close dialog
```

**Diagram sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [posts.ts](file://src/react-app/lib/posts.ts)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [form.tsx](file://src/react-app/components/ui/form.tsx)

## Detailed Component Analysis

### ShortPostComposer
Responsibilities:
- Manage form state for body, images, and poll configuration.
- Validate input using richPostSchema.
- Support publishing now or scheduling for later.
- Handle draft loading and editing flow.
- Provide image previews and attachment removal.
- Communicate with API via createPost/updateDraftPost.

Validation and UX:
- Body length limit enforced by schema and maxLength attribute.
- Poll requires question and 2–4 options when enabled.
- Publish disabled until there is valid content.
- Inline character count and accessible labels.

Data flow:
- On submit, build FormData if needed, include scheduledFor when applicable, and call mutation.
- On success, invalidate feed, schedules, and draft queries; show toast and close.

Accessibility:
- Dialog with descriptive title and description.
- Labels and aria-describedby for inputs.
- Keyboard-friendly controls and focus management.

```mermaid
flowchart TD
Start(["Open Composer"]) --> LoadDraft{"Editing draft?"}
LoadDraft --> |Yes| FetchDraft["Fetch draft via query"]
LoadDraft --> |No| InitForm["Initialize form with defaults"]
FetchDraft --> InitForm
InitForm --> UserInput["User edits body/images/poll"]
UserInput --> Validate["Zod validation on submit"]
Validate --> Valid{"Valid?"}
Valid --> |No| ShowErrors["Show FormMessage and alerts"]
Valid --> |Yes| Mode{"Publish mode"}
Mode --> |Now| BuildPayload["Build payload (JSON or FormData)"]
Mode --> |Schedule| ValidateTime["Validate future datetime"]
ValidateTime --> |Invalid| ShowError["Toast error and stop"]
ValidateTime --> |Valid| BuildPayload
BuildPayload --> Mutate["Call mutation (create/update)"]
Mutate --> Success{"Success?"}
Success --> |Yes| Invalidate["Invalidate queries and toast"]
Success --> |No| ErrorToast["Toast error"]
Invalidate --> Close["Close dialog"]
ErrorToast --> Close
ShowErrors --> End(["End"])
Close --> End
```

**Diagram sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [posts.ts](file://src/react-app/lib/posts.ts)

**Section sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [posts.ts](file://src/react-app/lib/posts.ts)

### ScheduleDialog
Responsibilities:
- Present a datetime-local input constrained to a minimum future time.
- Convert local datetime to UTC ISO string.
- Save schedule via mutation and invalidate schedule queries.

Validation and UX:
- Enforces minimum future time.
- Shows timezone info.
- Provides clear success/error toasts.

```mermaid
sequenceDiagram
participant U as "User"
participant D as "ScheduleDialog"
participant M as "Mutation (saveSchedule)"
participant Q as "Query Client"
participant API as "API (/api/schedules)"
U->>D : Select datetime
D->>D : Validate min future time
U->>D : Click Schedule
D->>M : mutate()
M->>API : POST schedule with ISO datetime
API-->>M : Success
M->>Q : Invalidate schedule keys
M-->>D : onSuccess -> toast + close
```

**Diagram sources**
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)

**Section sources**
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)

### ReportDialog
Responsibilities:
- Allow users to select a reason and add optional details.
- Submit report via mutation and provide feedback.

Validation and UX:
- Reason is required (select control).
- Details are optional with max length.
- Toasts for success and error.

```mermaid
sequenceDiagram
participant U as "User"
participant R as "ReportDialog"
participant M as "Mutation (reportContent)"
participant API as "API (/api/reports)"
U->>R : Open dialog
U->>R : Choose reason and enter details
U->>R : Submit
R->>M : mutate({ targetType, targetId, reason, details })
M->>API : POST report
API-->>M : Success
M-->>R : onSuccess -> toast + close
```

**Diagram sources**
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)

**Section sources**
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)

### SaveButton
Responsibilities:
- Toggle saving/un-saving a post to/from the library.
- Optimistically update UI and roll back on failure.
- Invalidate relevant queries on success.

State management:
- Local displayedSaved state for immediate feedback.
- Mutation handles actual save/remove calls.

```mermaid
flowchart TD
Click["Click Save Button"] --> Toggle["Toggle displayedSaved"]
Toggle --> Mutate["Call saveToLibrary or removeFromLibrary"]
Mutate --> Success{"Success?"}
Success --> |Yes| Invalidate["Invalidate library/feed/custom queries"]
Success --> |No| Rollback["Rollback displayedSaved to previous"]
Invalidate --> Done(["Done"])
Rollback --> Done
```

**Diagram sources**
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [posts.ts](file://src/react-app/lib/posts.ts)

**Section sources**
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [posts.ts](file://src/react-app/lib/posts.ts)

### DiscoverySettingsPanel
Responsibilities:
- Fetch and display discovery preferences.
- Allow independent updates of interests and creator categories.
- Provide feedback via toasts and invalidate queries.

Integration:
- Uses DiscoveryCategoryPicker for selection.
- Leverages discovery.ts endpoints.

```mermaid
sequenceDiagram
participant P as "DiscoverySettingsPanel"
participant Q as "Query Client"
participant API as "API (/api/discovery/preferences)"
participant M1 as "Mutation (updateDiscoveryInterests)"
participant M2 as "Mutation (updateCreatorCategories)"
P->>API : GET preferences
API-->>P : { categories, interestCategoryIds, creatorCategoryIds }
P->>P : Render DiscoveryCategoryPicker x2
U->>P : Select categories and click Save
P->>M1 : mutate(interests) or M2 : mutate(creatorCategories)
M1->>API : PUT interests
M2->>API : PUT creator-categories
API-->>M1 : Success
API-->>M2 : Success
M1->>Q : Invalidate discovery keys (+ profile for creator categories)
M2->>Q : Invalidate discovery keys (+ profile)
M1-->>P : Toast success
M2-->>P : Toast success
```

**Diagram sources**
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [discovery.ts](file://src/react-app/lib/discovery.ts)

**Section sources**
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [discovery.ts](file://src/react-app/lib/discovery.ts)

### DiscoveryCategoryPicker
Responsibilities:
- Render selectable categories with a maximum selection limit.
- Maintain selected IDs and notify parent via onChange.
- Ensure accessibility with aria-pressed and keyboard interaction.

Validation:
- Enforces maximum selections client-side.

```mermaid
classDiagram
class DiscoveryCategoryPicker {
+categories : DiscoveryCategory[]
+selected : string[]
+maximum : number
+onChange(categoryIds : string[]) : void
+toggle(categoryId : string) : void
}
```

**Diagram sources**
- [DiscoveryCategoryPicker.tsx](file://src/react-app/components/DiscoveryCategoryPicker.tsx)
- [discovery.ts](file://src/react-app/lib/discovery.ts)

**Section sources**
- [DiscoveryCategoryPicker.tsx](file://src/react-app/components/DiscoveryCategoryPicker.tsx)
- [discovery.ts](file://src/react-app/lib/discovery.ts)

## Dependency Analysis
- ShortPostComposer depends on:
  - React Hook Form and Zod resolver for form state and validation
  - Zod schemas for rich post validation
  - Posts library for create/update and draft queries
  - UI form primitives for accessible form structure
- ScheduleDialog depends on:
  - Schedules library for saveSchedule
  - TanStack Query for cache invalidation
- ReportDialog depends on:
  - Admin library for reportContent
- SaveButton depends on:
  - Library and posts libraries for save/remove and feed invalidation
- DiscoverySettingsPanel depends on:
  - Discovery library for preferences and updates
  - DiscoveryCategoryPicker for selection UI

```mermaid
graph LR
SPC["ShortPostComposer.tsx"] --> SCH["schemas.ts"]
SPC --> POSTS["posts.ts"]
SPC --> FORM["ui/form.tsx"]
SD["ScheduleDialog.tsx"] --> POSTS
RD["ReportDialog.tsx"] --> POSTS
SB["SaveButton.tsx"] --> POSTS
DSP["DiscoverySettingsPanel.tsx"] --> DISC["discovery.ts"]
DSP --> DCP["DiscoveryCategoryPicker.tsx"]
```

**Diagram sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [DiscoveryCategoryPicker.tsx](file://src/react-app/components/DiscoveryCategoryPicker.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [posts.ts](file://src/react-app/lib/posts.ts)
- [discovery.ts](file://src/react-app/lib/discovery.ts)
- [form.tsx](file://src/react-app/components/ui/form.tsx)

**Section sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [DiscoveryCategoryPicker.tsx](file://src/react-app/components/DiscoveryCategoryPicker.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)
- [posts.ts](file://src/react-app/lib/posts.ts)
- [discovery.ts](file://src/react-app/lib/discovery.ts)
- [form.tsx](file://src/react-app/components/ui/form.tsx)

## Performance Considerations
- Avoid unnecessary re-renders by memoizing derived data (e.g., image previews).
- Use controlled inputs only where necessary; leverage React Hook Form’s uncontrolled optimization for large forms.
- Debounce heavy operations if needed (not currently used here).
- Keep mutation payloads minimal; use FormData efficiently for file uploads.
- Invalidate only necessary queries to reduce network churn.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Validation errors not showing: Ensure FormField wraps fields and FormMessage is present; verify zodResolver is correctly configured.
- Scheduling fails due to time zone: Confirm local datetime conversion to UTC ISO string; check minimum future time constraint.
- Image upload errors: Validate file types and sizes in schema; ensure accept attributes match allowed types.
- Poll submission issues: Ensure pollOptions array has 2–4 non-empty options when pollEnabled is true.
- SaveButton state rollback: Verify onError handler resets displayedSaved to previous value.
- Discovery settings not updating: Check that mutations invalidate correct query keys and toast messages reflect outcomes.

**Section sources**
- [ShortPostComposer.tsx](file://src/react-app/components/ShortPostComposer.tsx)
- [ScheduleDialog.tsx](file://src/react-app/components/ScheduleDialog.tsx)
- [ReportDialog.tsx](file://src/react-app/components/ReportDialog.tsx)
- [SaveButton.tsx](file://src/react-app/components/SaveButton.tsx)
- [DiscoverySettingsPanel.tsx](file://src/react-app/components/DiscoverySettingsPanel.tsx)
- [schemas.ts](file://src/react-app/lib/schemas.ts)

## Conclusion
These components implement robust, accessible, and user-friendly forms and inputs. They combine Zod-driven validation with React Hook Form for reliable data handling, TanStack Query for efficient state synchronization, and clear user feedback through toasts and inline messages. The modular design promotes reuse and maintainability while ensuring strong accessibility standards.

[No sources needed since this section summarizes without analyzing specific files]