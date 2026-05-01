# Requirements Document

## Introduction

The **Become Creator** feature allows any registered user of the social feed application to apply for creator status by submitting a verification form. Once approved (initially auto-approved on submission), the user's role is upgraded to `creator`, a congratulations screen is shown, and a new **Studio** section is unlocked in the sidebar navigation. The Studio provides a content-creation workspace where creators can publish different content types; the initial release supports **short posts** only, with the UI scaffolded for future types (long posts, courses, etc.).

The feature spans three layers:
1. **Creator Application** — a multi-field form with file upload, submitted by any subscriber.
2. **Role Upgrade & Session Refresh** — backend promotion of the user's role to `creator` and immediate reflection in the frontend session.
3. **Studio** — a creator-only page accessible from the sidebar, containing content-type cards and a short-post composer.

---

## Glossary

- **Subscriber**: A registered user whose `role` is `'subscriber'` in the `users` table.
- **Creator**: A registered user whose `role` is `'creator'` in the `users` table.
- **Creator_Application**: The form data submitted by a Subscriber to request creator status.
- **Creator_Application_Record**: The persisted row in the `creator_applications` table representing a submitted application.
- **Application_Form**: The UI form rendered at `/become-creator` that collects identity and content information.
- **Studio**: The creator-only page at `/studio` that serves as the content-creation workspace.
- **Content_Type_Card**: A clickable card in Studio representing a content type (short post, long post, course, etc.).
- **Short_Post_Composer**: The UI component (modal or dedicated page) used to write and publish a short post.
- **Short_Post**: A text-based post of up to 500 characters, stored in the existing `posts` table.
- **NID**: National Identity Document — a government-issued identification number.
- **NID_Document**: A scanned image or photo of the NID card, uploaded to R2 storage.
- **Session**: The HTTP-only JWT cookie that encodes the user's `id`, `email`, and `role`.
- **AppShell**: The authenticated layout component that renders the Sidebar and page outlet.
- **Sidebar**: The left-side navigation component rendered inside AppShell for authenticated users.
- **AuthContext**: The React context that holds the current user object and exposes `refreshCurrentUser`.

---

## Requirements

### Requirement 1: Become Creator Navigation Entry

**User Story:** As a Subscriber, I want to see a "Become Creator" link in the sidebar, so that I know I can apply for creator status at any time.

#### Acceptance Criteria

1. WHILE the authenticated user's role is `'subscriber'`, THE Sidebar SHALL render a "Become Creator" navigation link that routes to `/become-creator`.
2. WHILE the authenticated user's role is `'creator'`, THE Sidebar SHALL render a "Studio" navigation link that routes to `/studio` in place of the "Become Creator" link.
3. THE Sidebar SHALL apply the same active-link highlight style to the "Become Creator" and "Studio" links as it does to existing navigation links.

---

### Requirement 2: Creator Application Form

**User Story:** As a Subscriber, I want to fill out a verification form with my personal and content details, so that I can apply to become a creator.

#### Acceptance Criteria

1. WHEN a Subscriber navigates to `/become-creator`, THE Application_Form SHALL render with the following required fields: full legal name, street address, city, country, NID number, NID document image upload, at least one social profile URL, and at least one content sample URL.
2. THE Application_Form SHALL accept optional additional social profile URLs and content sample URLs beyond the minimum one each.
3. WHEN the user submits the Application_Form with all required fields populated, THE Application_Form SHALL disable the submit button and display a loading indicator until the submission completes.
4. IF the user submits the Application_Form with any required field empty or invalid, THEN THE Application_Form SHALL display a field-level validation error message adjacent to each invalid field without submitting the form.
5. THE Application_Form SHALL validate that each social profile URL and content sample URL is a well-formed absolute URL (begins with `https://`).
6. THE Application_Form SHALL accept NID document uploads in JPEG, PNG, or WebP format with a maximum file size of 10 MB.
7. IF the uploaded NID document exceeds 10 MB or is not an accepted image format, THEN THE Application_Form SHALL display an error message and prevent form submission.
8. WHILE a Creator_Application has already been submitted by the current user, THE Application_Form SHALL display a read-only status message indicating the application is under review instead of the editable form.

---

### Requirement 3: Creator Application Submission API

**User Story:** As a Subscriber, I want my application data to be securely stored, so that it can be reviewed and my account can be upgraded.

#### Acceptance Criteria

1. WHEN a valid multipart form submission is received at `POST /api/creator/apply`, THE Creator_Application_Record SHALL be persisted to the `creator_applications` table with status `'approved'` and the user's role in the `users` table SHALL be updated to `'creator'` in the same operation.
2. THE Creator_Application_Record SHALL store: `userId`, `fullName`, `address`, `city`, `country`, `nidNumber`, `nidDocumentR2Key`, `socialLinks` (JSON array), `contentLinks` (JSON array), `status`, and `createdAt`.
3. WHEN the NID document file is received, THE API SHALL upload it to R2 storage under the key `nid-documents/{userId}/{filename}` and store the R2 key in the Creator_Application_Record.
4. IF a Creator_Application_Record already exists for the requesting user, THEN THE API SHALL return HTTP 409 with an error message and SHALL NOT create a duplicate record or modify the user's role.
5. IF the request is made by a user whose role is already `'creator'`, THEN THE API SHALL return HTTP 409 with an error message.
6. IF any required field is missing from the submission, THEN THE API SHALL return HTTP 422 with a descriptive error message identifying the missing field.
7. IF the NID document file exceeds 10 MB, THEN THE API SHALL return HTTP 413.
8. IF the NID document file is not JPEG, PNG, or WebP, THEN THE API SHALL return HTTP 415.
9. WHEN the application is successfully submitted, THE API SHALL return HTTP 201 with a response body containing `{ "role": "creator" }`.

---

### Requirement 4: Post-Submission Congratulations

**User Story:** As a newly approved creator, I want to see a congratulations message after submitting my application, so that I know my status has been upgraded.

#### Acceptance Criteria

1. WHEN the Application_Form submission receives a successful response, THE Application_Form SHALL call `refreshCurrentUser` on the AuthContext to update the session with the new `'creator'` role.
2. WHEN the Application_Form submission receives a successful response, THE Application_Form SHALL navigate to `/studio` and display a congratulations banner or toast notification confirming the user is now a creator.
3. THE congratulations message SHALL include the user's display name and a prompt to start creating content in Studio.

---

### Requirement 5: Studio Page Access Control

**User Story:** As a Creator, I want a Studio page that only I and other creators can access, so that content-creation tools are not exposed to subscribers.

#### Acceptance Criteria

1. WHEN an authenticated user with role `'creator'` navigates to `/studio`, THE Studio SHALL render the content-creation workspace.
2. WHEN an authenticated user with role `'subscriber'` navigates to `/studio`, THE AppShell SHALL redirect the user to `/become-creator`.
3. WHEN an unauthenticated user navigates to `/studio`, THE ProtectedRoute SHALL redirect the user to `/login`.
4. THE Studio page route SHALL be registered in `App.tsx` under the existing `ProtectedRoute` and `AppShell` wrappers.

---

### Requirement 6: Studio Content Type Cards

**User Story:** As a Creator, I want to see content-type cards in Studio, so that I can choose what kind of content to create.

#### Acceptance Criteria

1. WHEN a Creator views the Studio page, THE Studio SHALL display at minimum the following Content_Type_Cards: "Short Post", "Long Post", and "Course".
2. THE "Long Post" and "Course" Content_Type_Cards SHALL be rendered in a visually disabled state (reduced opacity, non-interactive cursor) with a "Coming Soon" label.
3. WHEN a Creator clicks the "Short Post" Content_Type_Card, THE Studio SHALL open the Short_Post_Composer.
4. THE Studio SHALL display each Content_Type_Card with a distinct icon, a title, and a short description of the content type.

---

### Requirement 7: Short Post Composer — Modal vs. Page Decision

**User Story:** As a Creator, I want to write and publish a short post from Studio, so that my followers can see my content in their feed.

> **Architecture note — modal vs. dedicated page:**
> A modal is recommended for the Short_Post_Composer because short posts are brief (≤ 500 characters), the composer requires no complex navigation, and keeping the user on the Studio page preserves context. A dedicated page would be appropriate for long-form content (long posts, courses) where the editor is complex and benefits from full-screen real estate. This requirement therefore specifies a modal for short posts.

#### Acceptance Criteria

1. WHEN the Short_Post_Composer is opened, THE Short_Post_Composer SHALL render as an overlay modal on top of the Studio page without navigating away from `/studio`.
2. THE Short_Post_Composer SHALL contain a textarea for the post body with a maximum length of 500 characters.
3. THE Short_Post_Composer SHALL display a live character count showing characters remaining (e.g., "320 / 500").
4. WHEN the Creator submits the Short_Post_Composer with a non-empty body, THE Short_Post_Composer SHALL send a `POST /api/posts` request with the post body.
5. IF the post body is empty or exceeds 500 characters, THEN THE Short_Post_Composer SHALL disable the publish button and display a validation message.
6. WHEN the post is successfully published, THE Short_Post_Composer SHALL close the modal and display a success toast notification.
7. WHEN the Creator dismisses the Short_Post_Composer without publishing, THE Short_Post_Composer SHALL close without sending any request.

---

### Requirement 8: Short Post Publication API

**User Story:** As a Creator, I want my short posts to be stored and appear in subscribers' feeds, so that my content reaches my audience.

#### Acceptance Criteria

1. WHEN a valid `POST /api/posts` request is received from an authenticated Creator, THE API SHALL insert a new row into the `posts` table with the provided body and the creator's `userId` as `authorId`.
2. IF the request is made by a user with role `'subscriber'`, THEN THE API SHALL return HTTP 403 with an error message.
3. IF the post body is empty or exceeds 500 characters, THEN THE API SHALL return HTTP 422 with a descriptive error message.
4. WHEN the post is successfully created, THE API SHALL return HTTP 201 with the new post's `id`, `body`, and `createdAt`.
5. WHEN a Subscriber who follows the Creator loads their feed, THE Feed SHALL include the new post in reverse-chronological order.
