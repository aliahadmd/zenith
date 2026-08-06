---
kind: external_dependency
name: Cloudflare Workers Infrastructure
slug: cloudflare-workers
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
source_files:
    - wrangler.json
    - src/worker/index.ts
    - src/worker/lib/email.ts
---

### Role
Primary compute and infrastructure platform for the backend API and asset serving.

### Integrated Services
- **D1**: SQLite database for relational data (users, posts, memberships).
- **R2**: Object storage for media assets (audio files, images, covers).
- **Email Workers**: Transactional email delivery (OTP codes, notifications) via `NOTIFICATION_EMAIL` binding.
- **Assets**: Serves the React frontend static assets via the `ASSETS` binding.

### Configuration
- Deployed via `wrangler deploy`.
- Uses `nodejs_compat` compatibility flag.
- Observability enabled with logs and traces.