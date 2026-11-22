# AlumniConnect Backend — REST API & Realtime Gateway

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express Version](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon_Serverless-4169E1?logo=postgresql&logoColor=white)](https://neon.tech/)
[![Redis Cache](https://img.shields.io/badge/Redis-Upstash_Distributed-DC382D?logo=redis&logoColor=white)](https://upstash.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Vitest](https://img.shields.io/badge/Vitest-209_Passing_Tests-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 1. Executive Overview & Institutional Scope

**AlumniConnect Backend** is an academically credible, single-university, privacy-first networking and career platform engineered exclusively for **North Western University (NWU), Khulna, Bangladesh (`nwu.ac.bd`)**.

The backend operates strictly under the **Model-View-Presenter (MVP)** architectural pattern, separating HTTP ingestion, DTO privacy masking, domain state machine transitions, and database persistence into decoupled, strictly typed layers.

### Institutional Benchmarks
- **Single-University Scope:** Single-tenant by design (`slug: north-western-university`). Multi-tenancy, cross-university data sharing, and commercial billing logic are strictly omitted.
- **4 Canonical Roles:** Strict Role-Based Access Control (RBAC) across `STUDENT`, `ALUMNI`, `MODERATOR`, and `SUPER_ADMIN`.
- **Privacy-First Data Masking:** Zero raw personal identifiable information (PII) is exposed. Masking scopes (`ONLY_ME`, `CONNECTIONS_ONLY`, `ALL_MEMBERS`) are resolved dynamically in presenter layers before HTTP transmission.
- **Fail-Open Resilience:** Redis caching operates in a fail-open model—if Redis is unreachable, queries seamlessly fall back to PostgreSQL with zero service disruption.

---

## 2. Core Architectural Highlights

```
                          [ Incoming HTTP / WebSocket Request ]
                                           │
                                           ▼
             ┌──────────────────────────────────────────────────────────┐
             │ VIEW LAYER: Routes, Middlewares, Zod Validation Schemas  │
             │ (Rate Limiting, Tenant Boundary, JWT Auth, RBAC Guards)  │
             └─────────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
             ┌──────────────────────────────────────────────────────────┐
             │ PRESENTER LAYER: Privacy Masking & Response Envelopes    │
             │ (DirectoryPresenter, MentorshipPresenter, ApiResponse)   │
             └─────────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
             ┌──────────────────────────────────────────────────────────┐
             │ MODEL LAYER: Services & Repositories                     │
             │ • Domain Logic, 6-State Machines, Audit Log Triggers     │
             │ • Redis Cache-Aside & Prisma 7.10 PostgreSQL Queries     │
             └──────────────────────────────────────────────────────────┘
```

1. **JWT Auth & Rotating Token Families:**
   - Short-lived **Access Tokens (15 minutes)** stored in client memory.
   - Long-lived **Refresh Tokens (30 days)** stored in secure `HTTP-Only`, `SameSite=Lax` cookies.
   - Database-backed `Session` model with rotating `familyId`. If an expired or compromised refresh token is reused, the entire token family is immediately revoked to thwart replay attacks.
2. **Viewer-Neutral Redis Caching (`dir:v`):**
   - Directory search queries are hashed and cached viewer-neutrally (`dir:v{version}:{universityId}:{group}:{queryHash}`) with a 120-second TTL.
   - Viewer and blocked-user exclusions plus dynamic privacy masking occur in-memory per request, maximizing cache hits while ensuring zero PII leakage.
   - Cache versions increment automatically upon profile updates, privacy toggle changes, or account suspensions.
3. **6-State Mentorship Lifecycle:**
   - Formal state machine: `REQUESTED` &rarr; `CLARIFICATION_REQUESTED` &rarr; `REQUESTED` &rarr; `ACTIVE` &rarr; `COMPLETED` / `REJECTED` / `CANCELLED`.
   - Mentors have an enforced concurrency guard of maximum 5 active mentees (`maxActiveMentees <= 5`).
   - Private session notes are strictly visible to mentors and masked from student mentees.
4. **Symmetric Connections & Bidirectional Blocking:**
   - Symmetric connection lifecycle with a mandatory 7-day rejection cooldown.
   - Bidirectional blocking instantly severs connections, terminates active mentorship requests, and excludes both parties from directory search results and detail queries.
5. **Centralized Department Architecture & Safe Delete:**
   - Relational `Department` model paired with dual-persistence (`departmentId` foreign key alongside legacy string `department`).
   - Safe delete protection prevents removal of any department containing enrolled students or alumni (`409 Conflict`).
6. **Zero-Disk Cloudinary Streaming:**
   - Upload pipeline uses in-memory Multer buffers (`memoryStorage`) streamed directly to Cloudinary via `streamifier`, avoiding temporary disk writes on serverless/container hosts.
7. **Automated Lifecycle Schedulers:**
   - Cron schedulers automatically transition expired events to `COMPLETED`, dispatch 24-hour RSVP reminders, and publish/archive scheduled announcements.

---

## 3. Tech Stack Inventory

| Domain | Technology | Version | Purpose |
| :--- | :--- | :---: | :--- |
| **Runtime** | Node.js (ESM) | `>=20.x` | High-performance asynchronous JavaScript runtime |
| **Framework** | Express.js | `5.1.0` | HTTP routing, middleware pipeline, and REST APIs |
| **Language** | TypeScript | `5.9.3` | Strict type safety, interfaces, and build verification |
| **Database** | PostgreSQL (Neon) | `16` | Serverless ACID-compliant relational persistence |
| **ORM** | Prisma | `7.10.0` | Schema migrations, query builder, and 36 models |
| **Cache & Limit** | Upstash Redis | Distributed | Cache-aside query acceleration and sliding window limiters |
| **Realtime** | Socket.io | `4.8.1` | Presence tracking, live typing, and instant messaging |
| **Authentication** | JSON Web Tokens & Argon2id | - | Stateless access tokens, rotating sessions, secure hashing |
| **Validation** | Zod | `3.24.2` | Runtime schema validation and sanitization |
| **Logging** | Pino & Pino-Pretty | `9.6.0` | Structured NDJSON production logging with colorized dev logs |
| **Media Pipeline** | Cloudinary SDK & Multer | `2.7.0` | In-memory image processing and secure cloud CDN |
| **Email Relay** | Nodemailer & Mailpit | `6.10.0` | Transactional email delivery and local testing |
| **Testing** | Vitest | `3.0.7` | Unit and integration testing across 30 test suites |

---

## 4. Project Directory Structure

```
alumni-connect-backend/
├── prisma/
│   ├── migrations/               # Prisma database migration history
│   ├── provision-*.ts            # Automated domain data provisioning scripts
│   ├── seed.ts                   # Initial database seeder (NWU defaults)
│   └── schema.prisma             # SSOT database schema (36 models, 31 enums)
├── src/
│   ├── config/                   # Environment schemas (Zod), Logger, Database, Redis
│   ├── constants/                # RBAC permissions, role definitions, and scopes
│   ├── controllers/              # Express HTTP request handlers
│   ├── dev/                      # Local development showcase & demo login modules
│   ├── errors/                   # ApiError class and centralized global error handler
│   ├── jobs/                     # Background cron schedulers (events, announcements)
│   ├── middlewares/              # Auth, RBAC, tenant isolation, rate limiters
│   ├── presenters/               # Privacy masking DTO formatters (MVP Presenter layer)
│   ├── realtime/                 # Socket.io server gateway, presence & chat rooms
│   ├── repositories/             # Prisma query abstractions & data aggregations
│   ├── routes/                   # REST API route declarations
│   ├── services/                 # Domain business logic & transactional workflows
│   ├── types/                    # Express augmentations and domain types
│   ├── utils/                    # API response helpers and async handlers
│   ├── validators/               # Zod request validation schemas
│   ├── app.ts                    # Express application instantiation & middleware pipeline
│   └── server.ts                 # Server entry point, cron bootstrapper, and socket listener
├── tests/
│   ├── integration/              # API endpoint integration test suites
│   └── unit/                     # Business logic, state machines, and schema tests
├── package.json                  # Scripts and dependency specifications
├── tsconfig.json                 # TypeScript compiler configuration (ESNext, NodeNext)
└── .env.example                  # Safe configuration template
```

---

## 5. Prerequisites & System Requirements

Ensure the following runtimes and services are available on your system:
- **Node.js:** `>= 20.10.0 LTS`
- **npm:** `>= 10.0.0`
- **PostgreSQL:** Version 15+ (Local instance or [Neon Serverless PostgreSQL](https://neon.tech/))
- **Redis (Optional):** [Upstash Redis](https://upstash.com/) or local Redis. (The server operates with fail-open fallback if Redis is unavailable).
- **Mailpit (Optional for local email testing):** Local SMTP server on port 1025 ([Mailpit Releases](https://github.com/axllent/mailpit/releases)).

---

## 6. Step-by-Step Installation & Local Setup

### Step 1: Clone and Enter Directory
```bash
git clone https://github.com/Purnendu-sarkar/alumni-connect-backend.git
cd alumni-connect-backend
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy the environment template and customize values:
```bash
cp .env.example .env
```
Ensure `PORT=5001`, `CORS_ORIGINS=http://localhost:3001`, and `DATABASE_URL` are properly configured.

### Step 4: Run Database Migrations & Generate Prisma Client
```bash
npm run db:migrate
npm run prisma:generate
```

### Step 5: Seed Canonical Database
Seed North Western University's canonical departments, administrator credentials, and baseline system records:
```bash
npm run db:seed
```

### Step 6: Start the Development Server
```bash
npm run dev
```
The server will boot with an ASCII status banner on **`http://localhost:5001`** (API Base: `http://localhost:5001/api/v1`).

---

## 7. Database Provisioning & Showcase Workflows

The repository includes pre-built provisioning scripts to instantly populate realistic academic records for defense demonstrations:

```bash
# Provision canonical Quick-Access showcase profiles (Student, Alumni, Moderator, Super Admin)
npm run showcase:provision

# Provision batch domain records for North Western University
npm run users:provision          # Seeds realistic student and alumni member profiles
npm run jobs:provision           # Seeds active job postings and applications
npm run events:provision         # Seeds upcoming and completed university events with RSVPs
npm run announcements:provision  # Seeds published and scheduled campus notices
npm run stories:provision        # Seeds alumni career spotlight articles

# Clean all demo data (resets to canonical baseline)
npm run demo:clean
```

---

## 8. Running Tests & Code Quality

The backend contains **30 test suites** with **209 automated unit and integration tests** executing via Vitest:

```bash
# Execute full Vitest automated test suite (209 tests)
npm test

# Run TypeScript typechecker
npm run typecheck

# Run ESLint validation
npm run lint

# Format code with Prettier
npm run format

# Production compilation build (Prisma generate + tsc)
npm run build
```

---

## 9. REST API Route Catalog (`/api/v1`)

All API routes return a unified JSON response envelope:
```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": { ... }
}
```

### Endpoint Inventory

| Resource Prefix | HTTP Method | Endpoint | Access Control | Description |
| :--- | :---: | :--- | :--- | :--- |
| **Authentication** | `POST` | `/api/v1/auth/register` | Public | Submit registration (Student or Alumni) |
| | `POST` | `/api/v1/auth/login` | Public | Authenticate with email and password |
| | `POST` | `/api/v1/auth/refresh` | Public (Cookie) | Rotate refresh token and issue new access token |
| | `POST` | `/api/v1/auth/logout` | Authenticated | Invalidate refresh token and clear session cookies |
| | `POST` | `/api/v1/auth/forgot-password` | Public | Request password reset verification email |
| | `POST` | `/api/v1/auth/reset-password` | Public | Execute password reset with secure token |
| | `POST` | `/api/v1/auth/setup-account` | Public | Complete invited account initialization |
| **Directory** | `GET` | `/api/v1/directory` | Student, Alumni | Search alumni/students with viewer-neutral Redis cache |
| | `GET` | `/api/v1/directory/:id` | Student, Alumni | View member profile with relationship-aware masking |
| **Connections** | `GET` | `/api/v1/connections` | Student, Alumni | List connections across 4 tabs (connected, received, sent) |
| | `POST` | `/api/v1/connections` | Student, Alumni | Send connection request (enforces 7-day cooldown) |
| | `PATCH` | `/api/v1/connections/:id/accept` | Recipient | Accept pending connection request |
| | `PATCH` | `/api/v1/connections/:id/reject` | Recipient | Reject connection request (triggers 7-day cooldown) |
| | `DELETE` | `/api/v1/connections/:id` | Participant | Sever active connection |
| **Blocks** | `POST` | `/api/v1/blocks/:userId` | Authenticated | Bidirectionally block member (severs connection & mentorship) |
| | `DELETE` | `/api/v1/blocks/:userId` | Authenticated | Unblock previously blocked member |
| **Mentorship** | `GET` | `/api/v1/mentorship` | Student, Alumni | Retrieve mentorship inquiries and active partnerships |
| | `POST` | `/api/v1/mentorship` | Student | Submit formal mentorship proposal to alumni |
| | `PATCH` | `/api/v1/mentorship/:id/clarify` | Alumni | Request clarification on mentorship proposal |
| | `PATCH` | `/api/v1/mentorship/:id/accept` | Alumni | Accept proposal (enforces max 5 mentees capacity) |
| | `PATCH` | `/api/v1/mentorship/:id/complete` | Participant | Mark completed mentorship partnership |
| **Departments** | `GET` | `/api/v1/departments` | Public | Retrieve active university departments |
| | `POST` | `/api/v1/admin/departments` | Super Admin | Create new academic department |
| | `DELETE` | `/api/v1/admin/departments/:id` | Super Admin | Delete department (Safe Delete: 409 if members enrolled) |
| **Jobs & Applications** | `GET` | `/api/v1/jobs` | Public | List verified job opportunities |
| | `POST` | `/api/v1/jobs` | Alumni, Admin | Publish new job opportunity |
| | `POST` | `/api/v1/applications` | Student, Alumni | Submit application with in-memory PDF resume buffer |
| **Events & RSVP** | `GET` | `/api/v1/events` | Public | List university events and workshops |
| | `POST` | `/api/v1/events/:id/rsvp` | Authenticated | Register RSVP (checks maximum event capacity) |
| **Announcements** | `GET` | `/api/v1/announcements` | Public | List active institutional announcements |
| **Stories** | `GET` | `/api/v1/stories` | Public | Browse published alumni spotlight success stories |
| **Messaging** | `GET` | `/api/v1/messages` | Authenticated | Retrieve conversation threads |
| | `POST` | `/api/v1/messages` | Authenticated | Dispatch direct message (dispatches socket event) |
| **Notifications** | `GET` | `/api/v1/notifications` | Authenticated | List in-app alerts and unread counter |
| | `PATCH` | `/api/v1/notifications/read-all`| Authenticated | Mark all notifications as read |
| **Governance** | `GET` | `/api/v1/admin/stats` | Super Admin | Retrieve platform telemetry and resource counts |
| | `GET` | `/api/v1/admin/verifications` | Moderator, Admin | Retrieve pending alumni verification queue |
| | `PATCH` | `/api/v1/admin/verifications/:id`| Moderator, Admin | Approve or reject alumni degree verification |
| **Public Telemetry** | `GET` | `/api/v1/public/stats` | Public | Verified North Western University aggregate stats |

---

## 10. WebSocket Real-Time Gateway Protocol

The backend runs a high-performance Socket.io 4.8 gateway on the primary HTTP port (`5001`):

### Handshake Authentication
Clients authenticate during the WebSocket handshake using the JWT access token:
```typescript
const socket = io('http://localhost:5001', {
  auth: { token: 'Bearer <ACCESS_TOKEN>' },
  withCredentials: true,
});
```

### Room Architecture
- `user:{userId}`: Personal user room for direct messages and private notifications.
- `uni:{universityId}`: University-wide presence and broadcast alerts.
- `conversation:{conversationId}`: Active conversation room for real-time messaging and typing states.

### WebSocket Events

| Event Name | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `conversation:join` | Client &rarr; Server | `{ conversationId: string }` | Joins conversation room if authorized participant |
| `conversation:leave` | Client &rarr; Server | `{ conversationId: string }` | Leaves conversation room |
| `typing:start` | Client &rarr; Server | `{ conversationId: string }` | Broadcasts typing state to conversation participants |
| `typing:stop` | Client &rarr; Server | `{ conversationId: string }` | Cancels typing state |
| `presence:check` | Client &rarr; Server | `{ userIds: string[] }` | Queries online status for a batch of user IDs |
| `presence:update` | Server &rarr; Client | `{ userId, status, lastSeenAt }` | Dispatched when a user connects or disconnects |
| `typing:status` | Server &rarr; Client | `{ conversationId, userId, isTyping }` | Real-time typing indicator |
| `message:new` | Server &rarr; Client | `{ message: MessageDto }` | Dispatches new chat message to recipient and room |
| `message:delivered` | Server &rarr; Client | `{ conversationId, messageId }` | Delivery receipt confirmation |
| `notification:new` | Server &rarr; Client | `{ notification: NotificationDto }` | Real-time social or system alert |

---

## 11. Repository & Contributors

**GitHub Repository:** [https://github.com/Purnendu-sarkar/alumni-connect-backend](https://github.com/Purnendu-sarkar/alumni-connect-backend)

### Core Engineering Team
- **Purnendu Sarkar** (`Purnendu-sarkar`) — Lead Full-Stack Software Engineer & System Architect
- **Aishwarya Roy** (`riyaroy123456`) — Core Features, Privacy Engine & Redis Cache Architect
- **Jannatul Adon** (`jannatuladon148-ctrl`) — Auth Lifecycle, Security Foundations & Shell Architect

**Institutional Partner:** Department of Computer Science & Engineering, North Western University (NWU), Khulna, Bangladesh.

---

## 12. License

This project is licensed under the [MIT License](LICENSE).
