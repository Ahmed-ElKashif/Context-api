<div align="center">

<!-- ═══════════════════════════════ LOGO ═══════════════════════════════ -->

<img src="./docs/logo.svg" width="96" height="96" alt="Context Logo" />

<h1>Context API</h1>

<p><em>The AI-native intelligence layer behind Context — where your documents think.</em></p>

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=22&pause=1000&color=4F46E5&center=true&vCenter=true&width=700&lines=AI-Native+Document+Intelligence;RAG+Chat+%C2%B7+Semantic+Search+%C2%B7+Vector+Embeddings;Built+with+TypeScript+%2B+MongoDB+%2B+LangChain" alt="Typing SVG" />

<br/>

<!-- ══════════════════════════════ BADGES ══════════════════════════════ -->

<p>
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white"/>
  <img src="https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white"/>
</p>

<p>
  <img src="https://img.shields.io/badge/LangChain-JS-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white"/>
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?style=for-the-badge&logo=openai&logoColor=white"/>
  <img src="https://img.shields.io/badge/Groq-Llama_70B-FF6B00?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Cloudinary-File_Storage-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white"/>
</p>

<p>
  <img src="https://img.shields.io/badge/Jest-100%25_Pass_Rate-C21325?style=for-the-badge&logo=jest&logoColor=white"/>
  <img src="https://img.shields.io/badge/JWT-Auth-FB015B?style=for-the-badge&logo=jsonwebtokens&logoColor=white"/>
  <img src="https://img.shields.io/badge/Token_Budget-50K_tokens%2Fday-4F46E5?style=for-the-badge"/>
</p>

<br/>

[![OpenAPI Docs](https://img.shields.io/badge/📖_OpenAPI_Spec-docs/openapi.yaml-4F46E5?style=flat-square)](./docs/openapi.yaml)
[![Postman](https://img.shields.io/badge/🧪_Postman_Collection-Import_Ready-FF6C37?style=flat-square)](./docs/postman/Context%20API.postman_collection.json)
[![AI Postman](https://img.shields.io/badge/🤖_AI_Endpoints_Collection-Import_Ready-7C3AED?style=flat-square)](./docs/postman/ai-postman-collection.json)

</div>

---

## 📋 Table of Contents

- [What is Context?](#-what-is-context)
- [The AI Pipeline](#-the-ai-pipeline)
- [Architecture](#-architecture)
- [Feature Map](#-feature-map)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [API Overview](#-api-overview)
- [Testing](#-testing)
- [Brand & Colors](#-brand--colors)
- [Team & Workflow](#-team--workflow)

---

## 🌐 What is Context?

**Context** is an AI-native personal knowledge base. You upload your documents — PDFs, images, Word files, or plain text snippets — and Context handles the rest: analyzing, embedding, organizing, and answering questions about them.

```
You upload a PDF
     │
     ▼
Context extracts → summarizes → embeds → lets you chat with it
```

It's not just storage. It's a second brain with semantic memory.

> Built for the **ITI ITP R2 2026** Final Project by **Contexters** 🧠🚀

---

## 🤖 The AI Pipeline

Every document uploaded to Context is automatically processed through a multi-stage AI pipeline **asynchronously** — the HTTP response returns in milliseconds while intelligence is built in the background.

```
                         ┌─── Upload ───┐
                         │  (Cloudinary │
 User uploads file ─────▶│  + MongoDB)  │
                         └──────┬───────┘
                                │ fire-and-forget
                                ▼
         ┌──────────────────────────────────────────────┐
         │              AI Orchestrator                  │
         │   (GPT-4o-mini via LangChain)                │
         │                                              │
         │  ✦ Extracts title, summary, tags             │
         │  ✦ Classifies content type                   │
         └──────────────┬───────────────────────────────┘
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
   ┌──────────────────┐  ┌──────────────────────┐
   │ CognitiveLoad    │  │  EmbeddingService     │
   │ (GPT-4o-mini)    │  │  (text-embedding-     │
   │                  │  │   3-small, 1536d)     │
   │ Scores: Light /  │  │                       │
   │ Medium / Heavy   │  │ Chunks → Atlas Vector │
   └──────────────────┘  │ Search (MongoDB)      │
                         └──────────────────────┘
```

**Once embedded, documents are queryable via:**

- **RAG Chat** — Ask questions, get grounded answers with citation context
- **Semantic Search** — Natural language search across your entire library
- **Document Comparison** — Llama 3.3 70B (Groq) deep-diffs two documents
- **Synthesis** — GPT-4o-mini merges multiple document summaries into one narrative
- **Folder Proposals** — GPT-4o-mini clusters your library into a smart folder tree

---

## 🏛️ Architecture

Context follows a strict **Feature-Based, Service-Controller** architecture enforced across all team rotations:

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│                     Express Router                   │
│   protect (JWT) → checkTokenBudget → controller     │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │      Controller        │
            │   (HTTP layer only)    │
            │  parse → delegate      │
            └──────────┬─────────────┘
                       │
                       ▼
            ┌────────────────────────┐
            │        Service         │
            │  (pure business logic) │
            │  no req / no res       │
            └──────────┬─────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
     ┌─────────────┐      ┌──────────────┐
     │   MongoDB   │      │  LangChain   │
     │  (Mongoose) │      │  / OpenAI    │
     └─────────────┘      │  / Groq      │
                          └──────────────┘
```

**Key enforced rules:**

- Controllers contain **zero** business logic — they parse and respond only
- Services contain **zero** `req` or `res` objects — fully platform-agnostic & testable
- All global types live in `src/core/types/` — no scattered `.d.ts` files

---

## 🗺️ Feature Map

<details>
<summary><b>🔐 Auth — <code>/api/auth</code></b></summary>

| Method | Route       | Description                    |
| ------ | ----------- | ------------------------------ |
| `POST` | `/register` | Register with email + password |
| `POST` | `/login`    | Login → returns signed JWT     |
| `GET`  | `/me`       | Get own profile (protected)    |

</details>

<details>
<summary><b>👤 Users — <code>/api/users</code></b></summary>

| Method | Route      | Description                    |
| ------ | ---------- | ------------------------------ |
| `GET`  | `/profile` | Fetch full profile             |
| `PUT`  | `/profile` | Update name, password, persona |
| `POST` | `/avatar`  | Upload avatar (Cloudinary)     |

</details>

<details>
<summary><b>📄 Documents — <code>/api/documents</code></b></summary>

| Method | Route              | Description                                          |
| ------ | ------------------ | ---------------------------------------------------- |
| `POST` | `/upload`          | Upload files OR text snippets → triggers AI pipeline |
| `GET`  | `/`                | Paginated list with sort/filter                      |
| `GET`  | `/suggested-focus` | 🎯 Top-2 documents ranked by cognitiveLoad + recency + isUnread |
| `GET`  | `/:id/chat`        | Fetch RAG chat history                               |
| `POST` | `/:id/chat`        | ⚡ Chat with document (RAG)                          |

> **Deduplication:** SHA-256 fingerprint check prevents re-uploading the same file.
> **Folder-aware uploads:** Pass `clientPaths` to recreate your original folder structure.
> **Suggested Focus:** Scoring formula — `Heavy=3 / Medium=2 / Light=1` load score + linear recency decay (1.0→0.0 over 30 days) + `+2` unread bonus. Only `Analyzed` documents are eligible.

</details>

<details>
<summary><b>📁 Folders — <code>/api/folders</code></b></summary>

| Method   | Route      | Description                                        |
| -------- | ---------- | -------------------------------------------------- |
| `GET`    | `/`        | Full folder tree                                   |
| `POST`   | `/`        | Create folder                                      |
| `PUT`    | `/:id`     | Rename / move folder                               |
| `DELETE` | `/:id`     | Delete folder                                      |
| `POST`   | `/propose` | ⚡ AI proposes a full-library semantic folder tree |

</details>

<details>
<summary><b>🧠 AI Core — <code>/api/ai</code></b></summary>

| Method | Route              | Description                                    |
| ------ | ------------------ | ---------------------------------------------- |
| `POST` | `/organize-folder` | ⚡ AI maps selected documents to folder paths  |
| `PUT`  | `/apply-folders`   | Commits AI proposal to DB (no AI call)         |
| `GET`  | `/search?q=...`    | ⚡ Semantic vector search across all documents |
| `POST` | `/synthesize`      | ⚡ Merge multiple documents into one summary   |

</details>

<details>
<summary><b>🔍 Comparison — <code>/api/comparison</code></b></summary>

| Method | Route      | Description                                                                        |
| ------ | ---------- | ---------------------------------------------------------------------------------- |
| `POST` | `/compare` | ⚡ Deep-compare two documents (Llama 3.3 70B via Groq, falls back to Llama 3.1 8B) |

Returns: `similarities`, `differences`, `uniqueToA`, `uniqueToB`.

</details>

<details>
<summary><b>🛡️ Admin — <code>/api/admin</code></b> <em>(admin role required)</em></summary>

| Method  | Route                | Description                                 |
| ------- | -------------------- | ------------------------------------------- |
| `GET`   | `/stats`             | KPI dashboard (delegates to analytics)      |
| `GET`   | `/users`             | Paginated + searchable + sortable user list |
| `PATCH` | `/users/:id/suspend` | Suspend / unsuspend a user                  |
| `GET`   | `/export/users`      | Download all users as CSV                   |

</details>

<details>
<summary><b>📊 Analytics — <code>/api/analytics</code></b></summary>

| Method | Route            | Auth   | Description                               |
| ------ | ---------------- | ------ | ----------------------------------------- |
| `POST` | `/track`         | Public | Frontend sends pageviews & feature events |
| `GET`  | `/top-pages`     | User   | Top pages by traffic (last 30 days)       |
| `GET`  | `/feature-usage` | User   | Feature usage breakdown                   |
| `GET`  | `/errors`        | Admin  | Error summary (last 7 days)               |

> Analytics events auto-expire after 90 days via a TTL index.

</details>

---

## 🛠️ Tech Stack

### Core Backend

| Technology           | Version | Purpose                 |
| -------------------- | ------- | ----------------------- |
| Node.js              | ≥ 22.x  | Runtime                 |
| Express              | 4.x     | HTTP framework          |
| TypeScript           | 5.x     | Type safety             |
| MongoDB + Mongoose   | 8.x     | Primary database        |
| JWT (jsonwebtoken)   | 9.x     | Auth tokens             |
| bcryptjs             | 2.x     | Password hashing        |
| Multer + Streamifier | —       | In-memory file handling |
| Cloudinary           | 2.x     | File storage & CDN      |

### AI & LangChain

| Technology                      | Purpose                                    |
| ------------------------------- | ------------------------------------------ |
| LangChain JS                    | Orchestration & structured output          |
| OpenAI GPT-4o-mini              | Orchestration, synthesis, folder proposals |
| OpenAI `text-embedding-3-small` | 1536-dim vector embeddings                 |
| Groq `llama-3.3-70b-versatile`  | Deep document comparison (primary)         |
| Groq `llama-3.1-8b-instant`     | Deep document comparison (fallback)        |
| MongoDB Atlas Vector Search     | Semantic similarity search                 |

### Security & Middleware

| Technology              | Purpose                                |
| ----------------------- | -------------------------------------- |
| Helmet                  | HTTP security headers                  |
| express-rate-limit      | Brute-force protection                 |
| HPP                     | HTTP parameter pollution guard         |
| cors                    | Cross-Origin Resource Sharing          |
| Token Budget Middleware | 50,000 token/day per-user AI spend cap |

### Dev & Testing

| Technology        | Purpose               |
| ----------------- | --------------------- |
| Jest + ts-jest    | Unit testing          |
| ESLint + Prettier | Code quality          |
| ts-node-dev       | Hot-reload dev server |

---

## 📁 Project Structure

```
context-api/
│
├── 📂 docs/
│   ├── openapi.yaml                    ← Full OpenAPI 3.0 specification
│   ├── ai-postman-collection.json      ← AI endpoints Postman collection
│   └── postman/
│       └── Context API.postman_collection.json  ← Complete collection
│
├── 📂 src/
│   ├── 📂 config/
│   │   ├── db.ts                       ← MongoDB connection
│   │   ├── cloudinary.ts               ← Cloudinary setup
│   │   └── models.registry.ts          ← LangChain model initialization
│   │
│   ├── 📂 core/
│   │   ├── 📂 errors/
│   │   │   └── AppError.ts             ← Typed operational error class
│   │   ├── 📂 middlewares/
│   │   │   ├── auth.middleware.ts       ← JWT protect guard
│   │   │   ├── requireAdmin.middleware.ts
│   │   │   ├── token-budget.middleware.ts  ← 50K token/day cap
│   │   │   ├── ai-logger.middleware.ts
│   │   │   └── error.middleware.ts     ← Global error handler
│   │   └── 📂 types/
│   │       ├── express.d.ts            ← req.user (IUser) augmentation
│   │       └── langgraph.d.ts
│   │
│   ├── 📂 features/                    ← ALL domain logic lives here
│   │   ├── 📂 auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.routes.ts
│   │   ├── 📂 users/
│   │   │   ├── user.model.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   └── user.routes.ts
│   │   ├── 📂 documents/
│   │   │   ├── document.model.ts
│   │   │   ├── upload.controller.ts    ← thin HTTP adapter
│   │   │   ├── upload.service.ts       ← all business logic
│   │   │   ├── document.routes.ts
│   │   │   └── __tests__/
│   │   │       └── upload.service.test.ts
│   │   ├── 📂 folders/
│   │   │   ├── folder.model.ts
│   │   │   ├── folder.controller.ts
│   │   │   └── folder.routes.ts
│   │   ├── 📂 ai/
│   │   │   ├── ai.controller.ts
│   │   │   ├── ai.service.ts
│   │   │   ├── ai.routes.ts
│   │   │   ├── orchestrator.service.ts
│   │   │   ├── embedding.service.ts
│   │   │   ├── cognitive-load.service.ts
│   │   │   ├── deep-thinker.service.ts
│   │   │   ├── folder-proposer.service.ts
│   │   │   └── token-budget.service.ts
│   │   ├── 📂 comparison/
│   │   │   ├── comparison.controller.ts
│   │   │   └── comparison.routes.ts
│   │   ├── 📂 admin/
│   │   │   ├── admin.controller.ts
│   │   │   ├── admin.service.ts
│   │   │   ├── admin.routes.ts
│   │   │   └── __tests__/
│   │   │       └── admin.service.test.ts
│   │   └── 📂 analytics/
│   │       ├── analytics.model.ts
│   │       ├── analytics.controller.ts
│   │       ├── analytics.service.ts
│   │       ├── analytics.routes.ts
│   │       └── __tests__/
│   │           └── analytics.service.test.ts
│   │
│   └── app.ts                          ← Express app entry point
│
├── jest.config.js
├── tsconfig.json
├── .env                                ← Never commit this!
└── README.md
```

---

## ⚡ Quick Start

### Prerequisites

- Node.js ≥ 18.x
- A MongoDB Atlas cluster (free tier works perfectly)
- A Cloudinary account (free tier)
- OpenAI API key
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Clone & Install

```bash
git clone <your-github-repo-url>
cd context-api
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Then fill in your `.env` (see [Environment Variables](#-environment-variables) below).

### 3. Run the Dev Server

```bash
npm run dev
# ✅  Server running at http://localhost:5000
# ✅  MongoDB connected
```

### 4. Run Tests

```bash
npm test
# ✅  All suites pass
```

---

## 🔑 Environment Variables

Create a `.env` in the root of `context-api/`. **Never commit this file.**

```env
# ── Server ────────────────────────────────────────────────
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000

# ── Database ───────────────────────────────────────────────
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/context?retryWrites=true

# ── Auth ───────────────────────────────────────────────────
JWT_SECRET=your-super-secret-key-minimum-32-chars
JWT_EXPIRES_IN=7d

# ── Cloudinary (File Storage) ──────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── OpenAI ─────────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── Groq (Document Comparison) ─────────────────────────────
GROQ_API_KEY=gsk_...
GROQ_VERSATILE_COMPARISON_MODEL=llama-3.3-70b-versatile
GROQ_INSTANT_COMPARISON_MODEL=llama-3.1-8b-instant

# ── AI Budget ──────────────────────────────────────────────
AI_DAILY_TOKEN_BUDGET=50000
```

---

## 🔌 API Overview

> Full specification: [`docs/openapi.yaml`](./docs/openapi.yaml)
> Base URL: `http://localhost:5000/api`

### Token Budget System

Every AI endpoint is guarded by the `checkTokenBudget` middleware.

```
User has 50,000 tokens/day. Any ⚡ endpoint consumes from this budget.
When the budget is exceeded, the API returns 429 with Retry-After headers.
```

| Header                  | Description                         |
| ----------------------- | ----------------------------------- |
| `X-RateLimit-Limit`     | Daily budget (50000)                |
| `X-RateLimit-Remaining` | Tokens left today                   |
| `X-RateLimit-Reset`     | ISO timestamp of midnight UTC reset |
| `Retry-After`           | Seconds until reset                 |

---

## 🧪 Testing

The test suite uses **Jest + ts-jest** with full module mocking — no live database or AI calls needed.

```bash
# Run all suites
npm test

# Run a specific feature
npx jest --testPathPatterns="auth"
npx jest --testPathPatterns="documents/__tests__/upload"
npx jest --testPathPatterns="admin"
npx jest --testPathPatterns="analytics"
```

### Coverage Summary

| Feature                 | Tests  | Status      |
| ----------------------- | ------ | ----------- |
| Auth Service            | 8      | ✅ Pass     |
| User Service            | 6      | ✅ Pass     |
| Comparison Service      | 4      | ✅ Pass     |
| Upload Service          | 13     | ✅ Pass     |
| Admin Service           | 8      | ✅ Pass     |
| Analytics Service       | 7      | ✅ Pass     |
| SuggestedFocus Service  | 10     | ✅ Pass     |
| **Total**               | **56** | **✅ 100%** |

---

## 🎨 Brand & Colors

Context uses a dual-mode design system. The API badge and logo colors are derived directly from the front-end palette.

| Token                  | Light Mode | Dark Mode      | Hex (Light) |
| ---------------------- | ---------- | -------------- | ----------- |
| `primary`              | Indigo     | Indigo-lighter | `#4F46E5`   |
| `accent` / `secondary` | Violet     | Purple         | `#7C3AED`   |
| `text`                 | Slate-700  | White          | `#334155`   |
| `border`               | Slate-200  | White/20       | `#E2E8F0`   |

The logo (`ContextLogo.tsx`) is a three-node neural graph — two input nodes merging into one intelligent core — a visual metaphor for how Context takes multiple document sources and produces unified intelligence.

---

## 🌿 Team & Workflow

> Context is a **team project** with weekly rotation. Every contributor works inside a clean feature boundary.

### Git Rules (The "No Tears" Policy)

1. **Never push directly to `main` or `dev`**
2. **Branch off `dev`** — use formats like: `feat/embedding-pipeline`, `fix/token-budget`, `docs/openapi`
3. **Conventional commits:** `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`
4. **PR to `dev`** — needs 1 approval from your rotation partner before merge
5. **Must pass:** `tsc --noEmit` + all Jest tests before opening a PR

### Feature Ownership Rule

> If you are working on `documents`, keep all changes inside `src/features/documents/`.  
> Shared utilities go into `src/core/`. External integrations go into `src/config/`.

---

<div align="center">

<img src="./docs/logo.svg" width="48" height="48" alt="Context Logo" />

**Built with ❤️ by 🧠 Contexters — ITI ITP R2 2026**

_"Your documents shouldn't just be stored. They should think."_

</div>
