# Requirements Document

## Introduction

This document defines the requirements for the initial release of a subscription-based social network SaaS. The scope covers user authentication with role-based access control, a social feed for subscribers, a user profile page, and a settings page for account management. The platform is built on a full Cloudflare stack (Workers + D1 + R2) with a React 19 frontend using shadcn/ui components.

Creator onboarding and email verification are explicitly out of scope for this iteration.

---

## Glossary

- **System**: The full-stack application running on Cloudflare Workers (backend) and React 19 (frontend).
- **Auth_Service**: The backend component responsible for registration, login, session management, and role enforcement.
- **Feed_Service**: The backend component responsible for retrieving and serving posts for a subscriber's feed.
- **Profile_Service**: The backend component responsible for reading and serving user profile data.
- **Settings_Service**: The backend component responsible for updating account credentials and profile assets.
- **Storage_Service**: The Cloudflare R2 integration responsible for storing and serving profile pictures.
- **Database**: The Cloudflare D1 instance accessed via Drizzle ORM.
- **User**: Any authenticated account in the system.
- **Subscriber**: A User with the "subscriber" role. All newly registered users receive this role by default.
- **Creator**: A User with the "creator" role. Creator onboarding is out of scope; the role is defined in the schema for future use.
- **Session**: A server-side authenticated session identified by a signed token (JWT or equivalent) stored in an HTTP-only cookie.
- **Feed**: The chronological list of posts from Creators that a Subscriber follows.
- **Follow**: A directional relationship where a Subscriber tracks a Creator's posts.
- **Profile**: The public-facing page displaying a User's name, username, tagline, social links, and subscription list.
- **Settings**: The authenticated page where a User manages their profile picture, password, and email address.
- **Sidebar**: The fixed left-side navigation panel present on all authenticated pages.

---

## Requirements

### Requirement 1: User Registration

**User Story:** As a visitor, I want to create an account with my email and password, so that I can access the platform as a subscriber.

#### Acceptance Criteria

1. THE Auth_Service SHALL expose a registration endpoint that accepts an email address and a password.
2. WHEN a registration request is received with a valid email and a password of at least 8 characters, THE Auth_Service SHALL create a new User record in the Database with the role set to "subscriber".
3. WHEN a registration request is received, THE Auth_Service SHALL store the password as a bcrypt hash and SHALL NOT store the plaintext password.
4. IF a registration request is received with an email address that already exists in the Database, THEN THE Auth_Service SHALL return a 409 Conflict response with a descriptive error message.
5. IF a registration request is received with an email address that does not conform to standard email format, THEN THE Auth_Service SHALL return a 422 Unprocessable Entity response with a descriptive error message.
6. IF a registration request is received with a password shorter than 8 characters, THEN THE Auth_Service SHALL return a 422 Unprocessable Entity response with a descriptive error message.
7. WHEN a User is successfully registered, THE Auth_Service SHALL create a Session and return a signed session token to the client via an HTTP-only cookie.

---

### Requirement 2: User Login

**User Story:** As a registered user, I want to log in with my email and password, so that I can access my account.

#### Acceptance Criteria

1. THE Auth_Service SHALL expose a login endpoint that accepts an email address and a password.
2. WHEN a login request is received with a valid email and matching password, THE Auth_Service SHALL create a Session and return a signed session token to the client via an HTTP-only cookie.
3. IF a login request is received with an email address that does not exist in the Database, THEN THE Auth_Service SHALL return a 401 Unauthorized response.
4. IF a login request is received with a password that does not match the stored hash for the given email, THEN THE Auth_Service SHALL return a 401 Unauthorized response.
5. THE Auth_Service SHALL NOT distinguish between "email not found" and "wrong password" in the error response, returning the same 401 message for both cases to prevent user enumeration.

---

### Requirement 3: User Logout

**User Story:** As an authenticated user, I want to log out, so that my session is terminated and my account is secured.

#### Acceptance Criteria

1. THE Auth_Service SHALL expose a logout endpoint accessible only to authenticated Users.
2. WHEN a logout request is received with a valid Session, THE Auth_Service SHALL invalidate the Session and clear the session cookie from the client.
3. WHEN a logout request is received with a valid Session, THE Auth_Service SHALL return a 200 OK response.

---

### Requirement 4: Role-Based Access Control

**User Story:** As a platform operator, I want role-based access control enforced at the API level, so that users can only access resources appropriate to their role.

#### Acceptance Criteria

1. THE Database SHALL define a "role" field on the User schema that accepts the values "subscriber" or "creator".
2. THE Auth_Service SHALL attach the authenticated User's role to every validated Session context.
3. WHEN an unauthenticated request is received on a protected endpoint, THE Auth_Service SHALL return a 401 Unauthorized response.
4. WHEN an authenticated request is received on an endpoint restricted to a role the User does not hold, THE Auth_Service SHALL return a 403 Forbidden response.
5. THE System SHALL enforce authentication checks via middleware applied to all protected API routes.

---

### Requirement 5: Social Feed

**User Story:** As a subscriber, I want to view a feed of posts from creators I follow, so that I can stay up to date with their content.

#### Acceptance Criteria

1. THE Feed_Service SHALL expose a feed endpoint accessible only to authenticated Users with the "subscriber" role.
2. WHEN a feed request is received from a Subscriber who follows at least one Creator, THE Feed_Service SHALL return the posts from those Creators ordered by creation date descending.
3. WHEN a feed request is received from a Subscriber who follows zero Creators, THE Feed_Service SHALL return an empty result set with a message of "You have not followed yet".
4. THE Feed_Service SHALL include the following fields for each post in the response: post ID, post body text, creation timestamp, and the author Creator's display name and username.
5. THE System SHALL display the feed message "You have not followed yet" in the Feed UI when the Feed_Service returns an empty result set.

---

### Requirement 6: Follow Relationship

**User Story:** As a subscriber, I want to follow a creator, so that their posts appear in my feed.

#### Acceptance Criteria

1. THE Database SHALL define a Follow table that records a directional relationship between a Subscriber (follower) and a Creator (followee).
2. THE Feed_Service SHALL expose a follow endpoint that accepts a Creator's user ID and creates a Follow record for the authenticated Subscriber.
3. IF a follow request is received where the Subscriber already follows the specified Creator, THEN THE Feed_Service SHALL return a 409 Conflict response.
4. IF a follow request is received where the specified Creator user ID does not exist or does not belong to a User with the "creator" role, THEN THE Feed_Service SHALL return a 404 Not Found response.

---

### Requirement 7: User Profile Page

**User Story:** As a visitor or subscriber, I want to view a user's profile page, so that I can learn about them and see who they subscribe to.

#### Acceptance Criteria

1. THE Profile_Service SHALL expose a profile endpoint that accepts a username and returns the User's public profile data.
2. WHEN a profile request is received for a valid username, THE Profile_Service SHALL return the User's display name, username, tagline (about me), profile picture URL, and social media links.
3. IF a profile request is received for a username that does not exist in the Database, THEN THE Profile_Service SHALL return a 404 Not Found response.
4. THE Profile_Service SHALL expose a subscriptions endpoint that returns the list of Creators a given Subscriber follows, including each Creator's display name, username, and profile picture URL.
5. THE System SHALL render the profile page with a "Subscribed" tab that displays the list returned by the subscriptions endpoint.
6. WHILE the authenticated User is viewing their own profile, THE System SHALL display the "Subscribed" tab as the default active tab.

---

### Requirement 8: Settings — Profile Picture

**User Story:** As an authenticated user, I want to upload a new profile picture, so that my profile reflects my identity.

#### Acceptance Criteria

1. THE Settings_Service SHALL expose a profile picture upload endpoint accessible only to authenticated Users.
2. WHEN a profile picture upload request is received with a valid image file, THE Storage_Service SHALL store the file in Cloudflare R2 under a key scoped to the User's ID.
3. WHEN a profile picture is successfully stored in R2, THE Settings_Service SHALL update the User's profile picture URL in the Database to the new R2 object URL.
4. THE Settings_Service SHALL accept image files of type JPEG, PNG, and WebP only.
5. IF a profile picture upload request is received with a file that exceeds 5 MB, THEN THE Settings_Service SHALL return a 413 Payload Too Large response.
6. IF a profile picture upload request is received with a file type other than JPEG, PNG, or WebP, THEN THE Settings_Service SHALL return a 415 Unsupported Media Type response.
7. WHEN a User uploads a new profile picture and a previous profile picture exists in R2, THE Storage_Service SHALL delete the previous R2 object to avoid orphaned files.

---

### Requirement 9: Settings — Change Password

**User Story:** As an authenticated user, I want to change my password, so that I can maintain the security of my account.

#### Acceptance Criteria

1. THE Settings_Service SHALL expose a change-password endpoint accessible only to authenticated Users.
2. WHEN a change-password request is received with the correct current password and a new password of at least 8 characters, THE Settings_Service SHALL update the User's password hash in the Database.
3. IF a change-password request is received with a current password that does not match the stored hash, THEN THE Settings_Service SHALL return a 401 Unauthorized response.
4. IF a change-password request is received with a new password shorter than 8 characters, THEN THE Settings_Service SHALL return a 422 Unprocessable Entity response with a descriptive error message.
5. IF a change-password request is received with a new password identical to the current password, THEN THE Settings_Service SHALL return a 422 Unprocessable Entity response indicating the new password must differ from the current password.

---

### Requirement 10: Settings — Change Email

**User Story:** As an authenticated user, I want to change my email address, so that my account stays linked to my current email.

#### Acceptance Criteria

1. THE Settings_Service SHALL expose a change-email endpoint accessible only to authenticated Users.
2. WHEN a change-email request is received with a valid new email address and the correct current password, THE Settings_Service SHALL update the User's email in the Database.
3. IF a change-email request is received with a new email address that does not conform to standard email format, THEN THE Settings_Service SHALL return a 422 Unprocessable Entity response with a descriptive error message.
4. IF a change-email request is received with a new email address that already exists in the Database, THEN THE Settings_Service SHALL return a 409 Conflict response.
5. IF a change-email request is received with a current password that does not match the stored hash, THEN THE Settings_Service SHALL return a 401 Unauthorized response.

---

### Requirement 11: Application Shell and Navigation

**User Story:** As an authenticated user, I want a consistent navigation sidebar, so that I can move between Feed, Profile, and Settings without losing context.

#### Acceptance Criteria

1. THE System SHALL render a fixed left Sidebar on all authenticated pages containing navigation links to: Feed, Profile, and Settings.
2. WHILE a User is on an authenticated page, THE System SHALL highlight the Sidebar link corresponding to the current active route.
3. THE System SHALL render a centered content column to the right of the Sidebar on all authenticated pages.
4. WHEN an unauthenticated User attempts to navigate to a protected route, THE System SHALL redirect the User to the login page.
5. WHEN an authenticated User navigates to the application root, THE System SHALL redirect the User to the Feed page.
6. THE System SHALL render the Sidebar, Feed, Profile, and Settings pages using only shadcn/ui components and Tailwind CSS utility classes, without introducing custom CSS outside the existing theme configuration.
