# 🧠 Context API

The backend engine for **Context**, an AI-native file system and smart document analyzer. Built with Node.js, Express, TypeScript, and MongoDB.

## 🛠 Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** MongoDB & Mongoose
- **Linting/Formatting:** ESLint & Prettier

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed on your machine:

- Node.js (v18 or higher)
- Git
- A MongoDB cluster (Atlas or Local)

### Local Development Setup

**1. Clone the repository**
\`\`\`bash
git clone <your-github-repo-url>
cd context-api
\`\`\`

**2. Install dependencies**
\`\`\`bash
npm install
\`\`\`

**3. Set up Environment Variables**
Create a `.env` file in the root directory and add the following:
\`\`\`env
NODE_ENV=development
PORT=5000
MONGO_URI=your_mongodb_connection_string_here
JWT_SECRET=your_super_secret_key_here
\`\`\`
_(Note: Never commit your `.env` file to GitHub!)_

**4. Start the development server**
\`\`\`bash
npm run dev
\`\`\`
The server should now be running on `http://localhost:5000`.

---

## 🏗 Architecture (Feature-Based)

To make our weekly team rotations seamless, this codebase uses a strict **Feature-Based Architecture**.

\`\`\`text
src/
├── config/ # Environment and Database configurations
├── core/ # App-wide utilities, middlewares, and custom errors
├── features/ # 📍 ALL DOMAIN LOGIC LIVES HERE
│ ├── auth/ # Each feature contains its own controller, model, routes, and service
│ ├── documents/
│ └── users/
└── services/ # External 3rd party integrations (S3, LLMs, Vector DBs)
\`\`\`
**Rule:** If you are working on the `documents` feature, keep your logic contained within `src/features/documents/`.

---

## 🌳 Git & Workflow Rules (The "No Tears" Policy)

1. **Never push directly to `main` or `dev`.**
2. **Branching:** Always branch off of `dev`.
   - Use formats like: `feat/user-login`, `fix/db-connection`, `docs/readme-update`.
3. **Commits:** Use conventional commits (`feat: ...`, `fix: ...`, `chore: ...`).
4. **Pull Requests:** Open a PR against the `dev` branch. You must get 1 approval from your rotation partner before merging.
5. **Formatting:** Your code must pass Prettier and ESLint checks before committing.

---

## 👥 Team Schedule

- **Month 1:** Web App & Core API
- **Month 2:** Mobile App (React Native) & AI Integration (RAG)
- **Rotation:** Roles swap every 7 days (Saturday).

- ## 🚀 Current Status (End of Week 1 Rotation)
**Phase 1:** Core Infrastructure, Auth, & User Management (GREEN 🟢)
**Completed by:** Dev 1 & Dev 2
**Ready for Phase 2 Handoff.**
