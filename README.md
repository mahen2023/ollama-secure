# Ollama Secure

A self-hosted chat UI for [Ollama](https://ollama.com) with user authentication, multi-user management, usage analytics, and a secure API proxy — all in one Node.js + React application.

## Features

- **Chat UI** — streaming responses, markdown rendering, multi-turn conversation history
- **File & image attachments** — upload images, PDFs, DOCX, and common code/text files
- **Prompt templates** — one-click starters for explain, summarize, code review, debug, and more
- **Chat export** — download any conversation as a Markdown file
- **User accounts** — JWT-based authentication, registration approval flow, per-user settings (system prompt, temperature, context length, model)
- **Role system** — `admin` and `user` roles; new registrations start as `pending` until an admin activates them
- **Per-user token limits** — optional daily and total token caps enforced server-side
- **API key access** — generate personal API keys to call Ollama through the `/v1/*` proxy from external tools (e.g. Open WebUI, curl)
- **Admin panel** — manage users, API keys, models, usage analytics, and audit log
- **Rate limiting** — sliding-window per-user request limiter (in-memory, no Redis required)
- **Ollama proxy** — the server forwards requests to Ollama and intercepts token counts for logging; the Ollama instance is never exposed directly to clients

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 18, Vite, Tailwind CSS        |
| Backend  | Node.js, Express 5                  |
| Database | MongoDB (Mongoose)                  |
| Auth     | JWT (jsonwebtoken), bcryptjs        |
| AI       | Ollama (local LLM runtime)          |

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [MongoDB](https://www.mongodb.com) (local or Atlas)
- [Ollama](https://ollama.com) running locally or on a reachable host

## Quick Start (Local)

```bash
# 1. Clone the repo
git clone <repo-url>
cd ollama-secure

# 2. Install server dependencies
npm install

# 3. Install client dependencies
npm install --prefix client

# 4. Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, and Ollama URL

# 5. Start Ollama (if not already running)
ollama serve

# 6. Build the client and start the server
npm start
```

The app will be available at:

| URL                          | Description        |
|------------------------------|--------------------|
| `http://localhost:3002/chat` | Chat UI            |
| `http://localhost:3002/chat/admin` | Admin panel  |

> The first registered user can be promoted to admin directly in MongoDB:
> ```
> db.users.updateOne({ username: "yourname" }, { $set: { role: "admin", status: "active" } })
> ```

## Docker

```bash
# Build and run with Docker Compose
cp .env.example .env
# Edit .env — use host.docker.internal instead of localhost for MongoDB and Ollama

docker compose up --build
```

The container exposes port `3001`. MongoDB and Ollama must be reachable from inside the container (use `host.docker.internal` on Mac/Windows or the host IP on Linux).

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable      | Default                                      | Description                              |
|---------------|----------------------------------------------|------------------------------------------|
| `PORT`        | `3001`                                       | HTTP port the server listens on          |
| `MONGODB_URI` | `mongodb://localhost:27017/ollama-chat`      | MongoDB connection string                |
| `JWT_SECRET`  | —                                            | Secret used to sign JWT tokens (required)|
| `OLLAMA_URL`  | `http://127.0.0.1:11434`                     | Base URL of your Ollama instance         |

## API

### Authentication (JWT — web UI)

| Method | Path              | Description                  |
|--------|-------------------|------------------------------|
| POST   | `/auth/register`  | Register a new account       |
| POST   | `/auth/login`     | Login, returns a JWT         |

### Chat

| Method | Path              | Description                         |
|--------|-------------------|-------------------------------------|
| GET    | `/chats`          | List all chats for the current user |
| POST   | `/chats`          | Create a new chat                   |
| GET    | `/chats/:id`      | Get a single chat with messages     |
| PATCH  | `/chats/:id`      | Update chat metadata / messages     |
| DELETE | `/chats/:id`      | Delete a chat                       |

### Ollama Proxy

| Path     | Auth           | Maps to              |
|----------|----------------|----------------------|
| `/api/*` | JWT (Bearer)   | `OLLAMA_URL/api/*`   |
| `/v1/*`  | `x-api-key`    | `OLLAMA_URL/api/*`   |

The `/v1/*` endpoint allows external integrations (scripts, Open WebUI, etc.) to reach Ollama through the secure proxy using a personal API key managed in **Settings → API Keys**.

## Project Structure

```
ollama-secure/
├── client/                # React + Vite frontend
│   └── src/
│       ├── api/           # API client functions
│       ├── components/
│       │   ├── admin/     # Admin panel tabs (Users, API Keys, Analytics, Models, Audit Log)
│       │   ├── auth/      # Login / register pages
│       │   ├── chat/      # Chat page, message list, input
│       │   ├── layout/    # Sidebar
│       │   ├── settings/  # Settings modal, API key manager
│       │   └── ui/        # Shared UI components (ModelSelector, etc.)
│       └── store/         # Zustand global state
├── middleware/            # Express middleware (auth, admin guard, rate limit, limits check)
├── models/                # Mongoose models (User, Chat, AuditLog, UsageLog)
├── routes/                # Express route handlers
├── server.js              # Entry point — Express app + Ollama proxy
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## License

ISC
