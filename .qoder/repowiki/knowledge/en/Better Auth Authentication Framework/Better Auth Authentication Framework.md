---
kind: external_dependency
name: Better Auth Authentication Framework
slug: better-auth
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
source_files:
    - src/worker/lib/auth.ts
    - src/worker/lib/auth-otp.ts
    - src/worker/lib/email.ts
---

### Role
Handles user authentication, session management, and user profile storage.

### Integration Pattern
- **Adapter**: Uses `@better-auth/drizzle-adapter` to store users/sessions in Cloudflare D1 (SQLite).
- **Method**: Email-based One-Time Password (OTP) only. Password-based auth is explicitly disabled (`emailAndPassword.enabled: false`).
- **Email Delivery**: Integrates with Cloudflare Email Workers via a custom `sendVerificationOTP` handler to deliver codes.
- **User Schema**: Extends the default user schema with custom fields like `role`, `username`, `tagline`, and `avatarR2Key`.