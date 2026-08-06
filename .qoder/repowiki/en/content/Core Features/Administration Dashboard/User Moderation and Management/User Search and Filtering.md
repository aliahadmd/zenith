# User Search and Filtering

<cite>
**Referenced Files in This Document**
- [admin.ts](file://src/worker/routes/admin.ts)
- [schema.ts](file://src/worker/db/schema.ts)
- [admin.ts](file://src/react-app/lib/admin.ts)
- [AdminPage.tsx](file://src/react-app/pages/AdminPage.tsx)
- [admin.ts](file://src/worker/middleware/admin.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [API Endpoint Overview](#api-endpoint-overview)
3. [Search and Filtering Capabilities](#search-and-filtering-capabilities)
4. [Pagination System](#pagination-system)
5. [Response Format](#response-format)
6. [Common Search Patterns](#common-search-patterns)
7. [Performance Considerations](#performance-considerations)
8. [Implementation Details](#implementation-details)
9. [Frontend Integration](#frontend-integration)
10. [Security and Access Control](#security-and-access-control)

## Introduction

The admin system provides a comprehensive user search and filtering API endpoint that enables administrators to efficiently locate and manage users across the platform. The `GET /admin/users` endpoint supports advanced search capabilities including email, username, and ID matching using SQL LIKE queries, along with sophisticated filtering options for user roles, account status, and administrative privileges.

This endpoint is designed to handle large user bases efficiently through optimized SQL queries, proper indexing, and pagination support that limits results to manageable page sizes up to 50 items per request.

## API Endpoint Overview

### Endpoint Specification
- **Method**: GET
- **Path**: `/api/admin/users`
- **Authentication**: Required (Administrator access)
- **Content-Type**: application/json

### Request Parameters

| Parameter | Type | Required | Description | Default | Max Length |
|-----------|------|----------|-------------|---------|------------|
| `page` | number | No | Page number for pagination | 1 | - |
| `pageSize` | number | No | Number of items per page | 20 | 50 |
| `search` | string | No | Search term for email, username, or ID | "" | 100 chars |
| `role` | string | No | Filter by user role: "subscriber" or "creator" | "" | - |
| `accountStatus` | string | No | Filter by account status: "active" or "suspended" | "" | - |
| `admin` | string | No | Filter by admin status: "yes", "no", or "" | "" | - |

### Response Structure

```json
{
  "items": [
    {
      "id": "string",
      "email": "string",
      "username": "string", 
      "displayName": "string",
      "role": "subscriber|creator",
      "accountStatus": "active|suspended",
      "createdAt": number,
      "adminRole": "owner|moderator|null"
    }
  ],
  "page": number,
  "pageSize": number,
  "total": number
}
```

**Section sources**
- [admin.ts:307-323](file://src/worker/routes/admin.ts#L307-L323)
- [admin.ts:64-68](file://src/worker/routes/admin.ts#L64-L68)

## Search and Filtering Capabilities

### Text Search Functionality

The search parameter supports partial matching across multiple user fields using SQL LIKE queries:

- **Email Search**: Matches any part of the email address
- **Username Search**: Matches any part of the username  
- **ID Search**: Matches any part of the user ID

The search implementation wraps the input with `%` wildcards on both ends to enable substring matching:

```sql
WHERE (? = '%%' OR u.email LIKE ? OR u.username LIKE ? OR u.id LIKE ?)
```

### Role-Based Filtering

Users can be filtered by their platform role:
- **subscriber**: Regular platform users
- **creator**: Content creators with publishing privileges

### Account Status Filtering

Administrators can filter users based on their account state:
- **active**: Normal, active accounts
- **suspended**: Accounts that have been suspended

### Administrative Privilege Filtering

The system distinguishes between regular users and administrators through the `admin_memberships` table:
- **yes**: Users with administrative privileges (owner or moderator)
- **no**: Regular users without administrative access

**Section sources**
- [admin.ts:313-317](file://src/worker/routes/admin.ts#L313-L317)
- [schema.ts:35-43](file://src/worker/db/schema.ts#L35-L43)

## Pagination System

The pagination system ensures efficient data retrieval and display management for large user datasets.

### Pagination Parameters

| Parameter | Description | Validation | Default |
|-----------|-------------|------------|---------|
| `page` | Current page number | Minimum: 1 | 1 |
| `pageSize` | Items per page | Range: 1-50 | 20 |

### Implementation Details

The pagination function implements robust validation and calculation:

```typescript
function pagination(c: { req: { query(name: string): string | undefined } }) {
  const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1)
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(c.req.query('pageSize') || '20', 10) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}
```

### Database Query Optimization

The pagination uses SQL LIMIT and OFFSET clauses for efficient database querying:

```sql
SELECT ... ORDER BY u.created_at DESC LIMIT ? OFFSET ?
```

The total count is calculated separately to provide accurate pagination metadata without loading all records.

**Section sources**
- [admin.ts:64-68](file://src/worker/routes/admin.ts#L64-L68)
- [admin.ts:318-322](file://src/worker/routes/admin.ts#L318-L322)

## Response Format

The API returns a standardized paginated response structure containing user details and pagination metadata.

### User Object Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `id` | string | Unique user identifier | "550e8400-e29b-41d4-a716-446655440000" |
| `email` | string | User's email address | "user@example.com" |
| `username` | string | Unique username | "john_doe" |
| `displayName` | string | Display name shown to other users | "John Doe" |
| `role` | string | Platform role | "subscriber" or "creator" |
| `accountStatus` | string | Account state | "active" or "suspended" |
| `createdAt` | number | Unix timestamp of account creation | 1640995200 |
| `adminRole` | string/null | Administrative role if applicable | "owner", "moderator", or null |

### Pagination Metadata

| Property | Type | Description |
|----------|------|-------------|
| `page` | number | Current page number |
| `pageSize` | number | Number of items per page |
| `total` | number | Total number of matching records |

**Section sources**
- [admin.ts:319](file://src/worker/routes/admin.ts#L319)
- [admin.ts:322](file://src/worker/routes/admin.ts#L322)
- [admin.ts:30-39](file://src/react-app/lib/admin.ts#L30-L39)

## Common Search Patterns

### Finding Users by Partial Email Address

To find users whose email contains a specific domain or pattern:

```
GET /api/admin/users?search=@gmail.com
```

This will match emails like "user@gmail.com", "test@gmail.com", etc.

### Filtering Suspended Accounts

To retrieve all suspended user accounts:

```
GET /api/admin/users?accountStatus=suspended
```

### Identifying Administrator Users

To find users with administrative privileges:

```
GET /api/admin/users?admin=yes
```

### Combining Multiple Filters

Filters can be combined for precise searches:

```
GET /api/admin/users?search=john&role=creator&accountStatus=active&admin=no
```

This finds active creator users named "john" who are not administrators.

### Searching by Username Pattern

To find users with usernames containing specific text:

```
GET /api/admin/users?search=admin
```

### Exact ID Lookup

For direct user lookup by ID:

```
GET /api/admin/users?search=550e8400-e29b-41d4-a716-446655440000
```

**Section sources**
- [admin.ts:309-317](file://src/worker/routes/admin.ts#L309-L317)

## Performance Considerations

### Database Indexing Strategy

The system implements strategic indexing to optimize query performance:

- **users_account_status_idx**: Index on `account_status` column for fast status filtering
- **admin_memberships_role_idx**: Index on admin role for administrator lookups
- **Unique indexes**: On email and username columns for uniqueness constraints

### Query Optimization Techniques

1. **Parameterized Queries**: All user inputs are properly parameterized to prevent SQL injection
2. **Efficient LIKE Queries**: Search patterns use `%pattern%` format for optimal index usage where possible
3. **Separate Count Queries**: Total count is calculated independently from result sets
4. **LIMIT/OFFSET Pagination**: Prevents loading entire datasets into memory

### Large Dataset Handling

For user bases exceeding thousands of records:

- **Default page size**: 20 items balances performance and usability
- **Maximum page size**: 50 items prevents excessive data transfer
- **Database-level pagination**: Uses SQL LIMIT and OFFSET for efficient querying
- **Connection pooling**: Leverages Cloudflare D1's connection management

### Monitoring and Scaling

- **Query execution time**: Monitor slow queries during peak usage
- **Memory usage**: Ensure pagination prevents memory overflow
- **Database connections**: Monitor connection pool utilization
- **Cache strategies**: Consider caching frequently accessed user lists

**Section sources**
- [schema.ts:30-32](file://src/worker/db/schema.ts#L30-L32)
- [schema.ts:41-43](file://src/worker/db/schema.ts#L41-L43)

## Implementation Details

### Core Query Logic

The user search endpoint implements a comprehensive SQL query with multiple WHERE conditions:

```sql
FROM users u LEFT JOIN admin_memberships am ON am.user_id = u.id
WHERE (? = '%%' OR u.email LIKE ? OR u.username LIKE ? OR u.id LIKE ?)
  AND (? = '' OR u.role = ?) AND (? = '' OR u.account_status = ?)
  AND (? = '' OR (? = 'yes' AND am.user_id IS NOT NULL) OR (? = 'no' AND am.user_id IS NULL))
ORDER BY u.created_at DESC
```

### Input Validation and Sanitization

1. **Search Input**: Trimmed and wrapped with LIKE wildcards
2. **Filter Parameters**: Validated against allowed enum values
3. **Pagination Values**: Clamped to safe ranges with defaults
4. **SQL Injection Prevention**: All parameters are properly escaped

### Error Handling

The endpoint handles various error scenarios:
- Invalid pagination parameters default to safe values
- Empty search strings disable text filtering
- Unknown filter values are ignored gracefully
- Database errors are caught and logged appropriately

### Audit Logging

All administrative actions are logged through the audit system for compliance and tracking purposes.

**Section sources**
- [admin.ts:313-322](file://src/worker/routes/admin.ts#L313-L322)

## Frontend Integration

### React Component Implementation

The frontend AdminPage component provides a user-friendly interface for searching and filtering users:

#### Search Interface Features

- **Real-time search**: Debounced input handling for responsive search
- **Dropdown filters**: Select components for role, status, and admin filters
- **Pagination controls**: Previous/next buttons with page indicators
- **Action buttons**: Suspend, restore, and session management operations

#### State Management

The component manages multiple state variables:
- `page`: Current pagination page
- `search`: Active search term
- `accountStatus`: Selected account status filter
- `role`: Selected user role filter  
- `admin`: Selected admin status filter

#### API Integration

The frontend uses the `getAdminPage` utility function to make consistent API calls with proper parameter serialization.

**Section sources**
- [AdminPage.tsx:719-886](file://src/react-app/pages/AdminPage.tsx#L719-L886)
- [admin.ts:49-51](file://src/react-app/lib/admin.ts#L49-L51)

## Security and Access Control

### Authentication Requirements

All admin endpoints require valid authentication through the middleware chain:

1. **authMiddleware**: Validates user session and JWT tokens
2. **adminMiddleware**: Verifies administrator privileges
3. **ownerMiddleware**: Additional protection for owner-only operations

### Authorization Checks

The system implements granular authorization:

- **Moderator restrictions**: Moderators cannot act on other administrators
- **Owner protection**: Final owner cannot be removed or demoted
- **Audit trail**: All administrative actions are logged with actor identification

### Input Validation

Comprehensive input validation prevents security vulnerabilities:

- **SQL injection prevention**: Parameterized queries throughout
- **XSS protection**: Proper escaping of user inputs
- **CSRF protection**: Token-based request validation
- **Rate limiting**: API rate limiting to prevent abuse

### Data Exposure Controls

The API carefully controls data exposure:
- **Sensitive fields**: Password hashes and internal IDs are excluded from responses
- **Field masking**: Some user data may be masked based on context
- **Access logging**: All data access is logged for security auditing

**Section sources**
- [admin.ts:85-86](file://src/worker/routes/admin.ts#L85-L86)
- [admin.ts:5-8](file://src/worker/middleware/admin.ts#L5-L8)
- [admin.ts:10-13](file://src/worker/middleware/admin.ts#L10-L13)