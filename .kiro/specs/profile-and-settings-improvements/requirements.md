# Requirements Document

## Introduction

This document defines the requirements for the second iteration of the subscription-based social network SaaS. The scope covers six improvement areas: username validation and generation rules, a username change feature in Settings, a public profile editing feature in Settings, a profile route rename, subscription terminology alignment across the API and UI, and a theme switcher. It also includes a targeted fix for email change idempotency.

The database schema (`follows` table, `follower_id` and `followee_id` columns) is unchanged; only the API contract and UI are updated.

---

## Glossary

- **System**: The full-stack application running on Cloudflare Workers (backend) and React 19 (frontend).
- **Auth_Service**: The backend component responsible for registration, login, session management, and username generation.
- **Settings_Service**: The backend component responsible for updating account credentials, profile assets, username, and public profile fields.
- **Feed_Service**: The backend component responsible for retrieving feed posts and managing subscription relationships.
- **Profile_Service**: The backend component responsible for reading and serving public user profile data.
- **Username_Validator**: The function or module that checks whether a given string conforms to the username format rules.
- **Username_Generator**: The function or module that derives an initial username from a new user's email address at registration time.
- **Theme_Provider**: The React context component (from `next-themes`) that manages the active colour theme for the application.
- **Theme_Switcher**: The UI component rendered in the Sidebar that allows a User to select Light, Dark, or System theme.
- **User**: Any authenticated account in the System.
- **Subscriber**: A User with the "subscriber" role.
- **Creator**: A User with the "creator" role.
- **Subscription**: A directional relationship where a Subscriber tracks a Creator's posts. Stored internally in the `follows` table.
- **Sidebar**: The fixed left-side navigation panel present on all authenticated pages.
- **Settings**: The authenticated page where a User manages their account and public profile.

---

## Requirements

### Requirement 1: Username Validation and Generation Rules

**User Story:** As a platform operator, I want usernames to follow a strict, consistent format, so that they are safe to embed in URLs and free of ambiguous characters.

#### Acceptance Criteria

1. THE Username_Validator SHALL accept a username as valid only when it consists exclusively of lowercase letters (`a`–`z`), digits (`0`–`9`), underscores (`_`), and hyphens (`-`).
2. THE Username_Validator SHALL accept a username as valid only when its length is between 3 and 10 characters inclusive.
3. IF a username begins or ends with a hyphen or underscore, THEN THE Username_Validator SHALL reject it as invalid.
4. IF a username contains any uppercase letter, space, or character outside the allowed set, THEN THE Username_Validator SHALL reject it as invalid.
5. WHEN a new User registers, THE Username_Generator SHALL derive a base string from the local part of the User's email address by lowercasing it and replacing any character outside `[a-z0-9]` with a hyphen.
6. WHEN deriving a username at registration, THE Username_Generator SHALL truncate the base string so that the base length plus the 4-character suffix and separator hyphen do not exceed 10 characters total, while keeping the base at a minimum length of 1 character.
7. WHEN deriving a username at registration, THE Username_Generator SHALL append a hyphen and a 4-character alphanumeric suffix to the base string to form the candidate username.
8. WHEN deriving a username at registration, THE Username_Generator SHALL produce a candidate username that passes all Username_Validator rules defined in criteria 1–4.
9. FOR ALL email local parts of any length or character composition, THE Username_Generator SHALL produce a username whose length is between 3 and 10 characters inclusive.

---

### Requirement 2: Username Change in Settings

**User Story:** As an authenticated user, I want to change my username from the Settings page, so that I can update my public identity without creating a new account.

#### Acceptance Criteria

1. THE Settings_Service SHALL expose a `PUT /api/settings/username` endpoint accessible only to authenticated Users.
2. WHEN a username change request is received, THE Settings_Service SHALL accept a JSON body containing a `newUsername` string field.
3. IF the `newUsername` field is absent or not a string, THEN THE Settings_Service SHALL return a 422 Unprocessable Entity response with a descriptive error message.
4. IF the `newUsername` value does not pass all Username_Validator rules, THEN THE Settings_Service SHALL return a 422 Unprocessable Entity response with a descriptive error message.
5. WHEN a username change request is received where `newUsername` is identical to the authenticated User's current username, THE Settings_Service SHALL return a 200 OK response without modifying any data.
6. IF a username change request is received where `newUsername` is already assigned to a different User, THEN THE Settings_Service SHALL return a 409 Conflict response with a descriptive error message.
7. WHEN a username change request is received with a valid `newUsername` that is not already taken, THE Settings_Service SHALL update the User's username in the database and return a 200 OK response.
8. THE System SHALL render a username change card on the Settings page containing a text input pre-populated with the User's current username and a submit button.
9. WHEN the username change form is submitted and THE Settings_Service returns a 422 or 409 response, THE System SHALL display the error message inline below the username input field.
10. WHEN the username change form is submitted and THE Settings_Service returns a 200 response, THE System SHALL display a success toast notification.

---

### Requirement 3: Public Profile Editing in Settings

**User Story:** As an authenticated user, I want to edit my public profile fields from the Settings page, so that visitors to my profile see accurate and up-to-date information about me.

#### Acceptance Criteria

1. THE Settings_Service SHALL expose a `PUT /api/settings/profile` endpoint accessible only to authenticated Users.
2. WHEN a profile update request is received, THE Settings_Service SHALL accept a JSON body containing the fields `displayName` (string), `tagline` (string, optional), and `socialLinks` (object, optional) where `socialLinks` may contain the optional string sub-fields `twitter`, `github`, and `website`.
3. IF the `displayName` field is absent, empty, or not a string, THEN THE Settings_Service SHALL return a 422 Unprocessable Entity response with a descriptive error message.
4. IF any URL field within `socialLinks` (`twitter`, `github`, or `website`) is provided and does not conform to a valid URL format, THEN THE Settings_Service SHALL return a 422 Unprocessable Entity response with a descriptive error message.
5. WHEN a profile update request passes all validation, THE Settings_Service SHALL update the User's `display_name`, `tagline`, and `social_links` fields in the database and return a 200 OK response.
6. THE System SHALL render a public profile card on the Settings page containing inputs for display name, tagline, and social link URLs (Twitter, GitHub, website).
7. WHEN the Settings page loads, THE System SHALL pre-populate the public profile card inputs with the authenticated User's current profile field values.
8. WHEN the profile update form is submitted and THE Settings_Service returns a 422 response, THE System SHALL display the error message inline below the relevant input field.
9. WHEN the profile update form is submitted and THE Settings_Service returns a 200 response, THE System SHALL display a success toast notification.

---

### Requirement 4: Profile Route Change

**User Story:** As a user, I want profile pages to be accessible at `/u/:username`, so that the URL structure is concise and consistent with common platform conventions.

#### Acceptance Criteria

1. THE System SHALL define the frontend route for user profile pages as `/u/:username`.
2. WHEN a User navigates to `/u/:username`, THE System SHALL render the profile page for the given username.
3. THE Sidebar SHALL render the authenticated User's profile link pointing to `/u/${username}`.
4. THE System SHALL use the `/u/:username` path for all in-app navigation links that point to a user profile page.
5. THE System SHALL NOT define a frontend route at `/profile/:username`; requests to that path SHALL fall through to the application's not-found handling.
6. THE Profile_Service backend API paths (e.g. `GET /api/profile/:username`) SHALL remain unchanged.

---

### Requirement 5: Subscription Terminology — API and UI

**User Story:** As a user, I want all subscription-related actions and messages to use "subscribe" and "creator" language, so that the platform's terminology is consistent and avoids confusion with unrelated "follow" concepts.

#### Acceptance Criteria

1. THE Feed_Service SHALL expose the subscription creation endpoint at `POST /api/feed/subscribe`.
2. WHEN a subscription creation request succeeds, THE Feed_Service SHALL return a 201 Created response with a JSON body containing the fields `subscriberId` (the authenticated User's ID) and `creatorId` (the target Creator's ID).
3. IF a subscription creation request is received where the authenticated User is already subscribed to the specified Creator, THEN THE Feed_Service SHALL return a 409 Conflict response with the message `'Already subscribed to this creator'`.
4. IF a subscription creation request is received where the specified Creator ID does not exist or does not belong to a User with the "creator" role, THEN THE Feed_Service SHALL return a 404 Not Found response.
5. WHEN a feed request is received from a Subscriber who has zero active subscriptions, THE Feed_Service SHALL return an empty result set with the message `"You haven't subscribed to any creators yet"`.
6. THE System SHALL NOT expose a `POST /api/feed/follow` endpoint; requests to that path SHALL return a 404 Not Found response.
7. THE System SHALL display the text `"You haven't subscribed to any creators yet"` as the primary empty-state message on the Feed page when the feed result set is empty.
8. THE System SHALL display the text `"Subscribe to creators to see their posts here."` as the secondary empty-state message on the Feed page when the feed result set is empty.
9. THE System SHALL label the subscriptions tab on the Profile page as `"Subscribed to"`.
10. WHEN the subscriptions tab on the Profile page contains no entries, THE System SHALL display the text `"Not subscribed to any creators yet."`.
11. THE System SHALL label the action button that creates a subscription as `"Subscribe"`.
12. THE System SHALL NOT display the words "follow", "following", or "follower" in any user-visible text element.
13. THE System SHALL continue to use the `follows` database table and the `follower_id` and `followee_id` column names internally; these are not user-visible and SHALL NOT be changed.

---

### Requirement 6: Theme Switcher

**User Story:** As a user, I want to switch between Light, Dark, and System themes, so that the application matches my visual preference and respects my operating system setting.

#### Acceptance Criteria

1. THE Theme_Provider SHALL wrap the entire React application so that all components have access to the active theme context.
2. THE Theme_Provider SHALL support three theme options: `"light"`, `"dark"`, and `"system"`.
3. WHEN the `"system"` theme is active, THE Theme_Provider SHALL apply the light or dark colour scheme based on the operating system's `prefers-color-scheme` media query.
4. THE Theme_Provider SHALL persist the User's selected theme to `localStorage` so that the preference is restored on subsequent page loads.
5. THE System SHALL render the Theme_Switcher component in the Sidebar, positioned near the bottom of the sidebar above or adjacent to the logout button.
6. THE Theme_Switcher SHALL present the three theme options (Light, Dark, System) using shadcn/ui components.
7. WHEN a User selects a theme option in the Theme_Switcher, THE Theme_Provider SHALL apply the selected theme immediately without requiring a page reload.
8. THE System SHALL apply `suppressHydrationWarning` (or the equivalent technique required by `next-themes`) to prevent a flash of the wrong theme on initial page load.

---

### Requirement 7: Email Change Idempotency

**User Story:** As an authenticated user, I want submitting my current email address to the change-email form to succeed silently, so that I am not shown a confusing conflict error when no actual change is needed.

#### Acceptance Criteria

1. WHEN a change-email request is received where the `newEmail` value is identical to the authenticated User's current email address and the provided `currentPassword` is correct, THE Settings_Service SHALL return a 200 OK response without modifying any data.
2. THE Settings_Service SHALL only return a 409 Conflict response for a change-email request when the `newEmail` value is already assigned to a **different** User's account.
3. IF a change-email request is received where the `newEmail` value is identical to the authenticated User's current email address and the provided `currentPassword` is incorrect, THEN THE Settings_Service SHALL return a 401 Unauthorized response.
