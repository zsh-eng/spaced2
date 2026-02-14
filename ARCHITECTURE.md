# Spaced2 Architecture

A spaced repetition flashcard app built as an offline-first PWA with a custom sync engine.

## Tech Stack

### Frontend (`/Users/admin/spaced2`)

- **React 18** + TypeScript, built with **Vite** (SWC)
- **React Router 7** for routing
- **Radix UI / Shadcn** for components, **TailwindCSS 4** for styling
- **Dexie 4** (IndexedDB wrapper) for local persistence
- **ts-fsrs** for the spaced repetition scheduling algorithm (FSRS)
- **remark/rehype** pipeline for Markdown rendering (with KaTeX math + code highlighting)
- **react-hook-form** + **zod** for form validation
- **vite-plugin-pwa** with Workbox for PWA/service worker support
- **next-themes** for dark/light mode

### Backend (`/Users/admin/spaced-backend`)

- **Hono** web framework on **Cloudflare Workers**
- **Cloudflare D1** (SQLite) via **Drizzle ORM**
- **Cloudflare R2** for image storage
- **Resend** for transactional email
- **jose** for Google OAuth JWT verification

---

## Project Structure

### Frontend

```
src/
├── routes/           # Page components (Review, Decks, Stats, Import, etc.)
├── components/
│   ├── ui/           # Shadcn base primitives
│   ├── form/         # Form components (textarea, image upload)
│   ├── review/       # Review UI (card display, grading buttons)
│   ├── hooks/        # Custom hooks (useCards, useDecks, useOnlineStatus, etc.)
│   ├── images/       # Image management components
│   └── nav/          # Navigation
├── lib/
│   ├── sync/         # Sync engine (engine.ts, operation.ts, server.ts, meta.ts)
│   ├── db/           # IndexedDB schema (persistence.ts) + in-memory store (memory.ts)
│   ├── images/       # Image caching & downloading (db.ts)
│   ├── files/        # File upload to backend (upload.ts)
│   ├── review/       # FSRS grading logic + card actions
│   ├── auth/         # Auth API calls
│   ├── types.ts      # Core TypeScript types
│   └── form-schema.ts
```

### Backend

```
src/
├── index.ts          # Hono app, all route handlers
├── db/schema.ts      # Drizzle schema (all tables)
├── client2server.ts  # Push: apply incoming operations
├── server2client.ts  # Pull: query & return operations for client
├── operation.ts      # Operation type definitions + zod validation
├── upload.ts         # R2 file upload handling
├── auth/
│   ├── index.ts      # Password hashing (PBKDF2), session management
│   ├── google.ts     # Google OAuth JWT verification
│   └── email-verify.ts
├── middleware/
│   ├── session.ts    # Session cookie validation
│   └── clientid.ts   # X-Client-Id header validation
drizzle/              # SQL migrations (0000, 0001, 0002)
```

---

## Sync Engine

The core architecture is an **offline-first, operation-based sync system**. All mutations are expressed as operations that are applied locally first, then pushed to the server in the background.

### Data Flow

```
User action
  → Create operation (with client timestamp + clientId)
  → Apply to in-memory store (MemoryDB)
  → Persist to IndexedDB (operations + pendingOperations tables)
  → Background push to server (POST /api/sync)
  → Server assigns seqNo, applies with conflict resolution
  → Other clients pull via GET /api/sync?seqNo=N
```

### Operations

Every mutation is an operation with a `type`, `payload`, and `timestamp`. There are 9 operation types:

| Operation          | Target                                                   | CRDT Strategy     |
| ------------------ | -------------------------------------------------------- | ----------------- |
| `card`             | Card scheduling state (due, stability, difficulty, etc.) | LWW Register      |
| `cardContent`      | Card front/back text                                     | LWW Register      |
| `cardDeleted`      | Card deletion flag                                       | LWW Register      |
| `cardBookmarked`   | Bookmark flag                                            | LWW Register      |
| `cardSuspended`    | Suspension date                                          | LWW Register      |
| `deck`             | Deck name/description/deleted                            | LWW Register      |
| `updateDeckCard`   | Card-to-deck membership                                  | Causal-Length Set |
| `reviewLog`        | Review history entry                                     | Grow-Only Set     |
| `reviewLogDeleted` | Review log deletion (undo)                               | LWW Register      |

### Conflict Resolution

**Last-Write-Wins (LWW) Registers** — Most tables use LWW. Each field family has its own timestamp (e.g., `cardLastModified` vs `cardContentLastModified` are independent). On conflict, the higher timestamp wins. If timestamps are equal, `clientId` is the tiebreaker (lexicographic). This separation means rating a card and editing its content can't conflict with each other.

**Causal-Length Set (CLSet)** — The deck-to-card relationship uses a counter. Odd count = card is in the deck, even count = card is removed. On conflict, the higher count wins. This allows concurrent add/remove without losing either operation.

**Grow-Only Set** — Review logs are append-only. They are never updated or deleted (deletion is handled by a separate `reviewLogDeleted` tombstone table with its own LWW register). Duplicates are ignored via unique constraints.

### Push (Client → Server)

- Runs every **10 seconds**, also triggered on `visibilitychange` (hidden) and `online` events
- Reads from `pendingOperations` IndexedDB table
- Sends in chunks of up to 2,500 operations per request (`POST /api/sync`)
- Server reserves sequence numbers atomically, then applies all operations in batch
- On success, sent operations are deleted from `pendingOperations`
- Operations are idempotent — resending is safe

### Pull (Server → Client)

- Runs every **150 seconds**, also triggered on `visibilitychange` (visible) and `online` events
- Sends last known `seqNo` as query param (`GET /api/sync?seqNo=N`)
- Server returns all operations with `seqNo > N` from **other clients** (echo filtering via `X-Client-Id`)
- Client applies received operations to in-memory store + persists to IndexedDB
- Updates local `seqNo`

### Sequence Numbers

The server maintains a `nextSeqNo` counter per user. When operations are pushed, the server atomically reserves a block of sequence numbers and assigns one to each operation. This provides a total order across all clients and enables efficient range-based pull queries.

---

## Local Data Layer

### IndexedDB (Dexie)

Database name: `SpacedDatabase`

| Table                 | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `operations`          | All applied operations — replayed on startup to rebuild in-memory state |
| `reviewLogOperations` | Review log operations (separate table to avoid loading at startup)      |
| `pendingOperations`   | Operations waiting to be pushed to server                               |
| `metadataKv`          | Key-value store for `clientId`, `seqNo`, `sessionExpiry`                |

### In-Memory Store (MemoryDB)

On app startup, all operations are loaded from IndexedDB and replayed to populate an in-memory store:

```
cards:        Record<id, CardWithMetadata>
decks:        Record<id, Deck>
decksToCards: Record<deckId, Record<cardId, clCount>>
```

The UI subscribes to this store via React 18's `useSyncExternalStore`. A pub/sub `notify()` triggers re-renders. Derived data (e.g., filtered card lists) is memoized based on a `notifyCount` that increments on each change.

Custom hooks: `useCards()`, `useDecks()`, `useDeck(id)`, `useCardsForDeck(deckId)`, `useReviewCards()`, `useCurrentCard()`, `useUndoStack()`.

---

## Image Handling

### Upload Flow

1. User pastes an image in the card editor textarea
2. Image is uploaded to the backend (`POST /api/upload`) as multipart form-data
3. Backend validates (PNG/JPEG only, max 2MB), computes CRC32 checksum for dedup
4. File stored in R2 at key `{userId}/{fileId}`
5. A Markdown image link `![alt](/api/files/{userId}/{fileId})` is inserted into the card content

### Storage Quotas

- Default: 100MB per user
- Enforced via D1 database triggers on the `files` table
- `userStorageMetrics` table tracks `totalFiles` and `totalSizeInBytes`

### Image Sync / Offline Caching

- A separate IndexedDB database (`ImageCache`) stores cached images
- Two tables: `images` (metadata + thumbnail) and `imageBlobs` (full binary content)
- When a flashcard is displayed, image URLs are extracted from the rendered Markdown
- Images are fetched from the server and cached locally for offline use
- Thumbnails (200x200 JPEG) are generated client-side
- An in-memory map (`ImageMemoryDB`) provides object URLs with reference counting to avoid redundant blob-to-URL conversions
- A `currentlyFetchingImages` map deduplicates concurrent fetch requests

---

## Authentication

### Methods

- **Email/password**: Registration creates a `tempUsers` entry, sends a verification email (via Resend) with a 6-char token (1-hour TTL). Verification promotes to `users` table.
- **Google OAuth**: Verifies Google JWT, creates/links `oauthAccounts` entry.

### Sessions

- Signed cookie (`sid`) with 30-day TTL
- `sessions` table tracks validity, expiry, and last activity
- `sessionMiddleware` validates on every protected request (returns 401 if invalid)
- Logout sets `valid = false`

### Client IDs

- Each device gets a 16-char nanoid (`POST /api/auth/clientId`)
- Stored in `clients` table, sent via `X-Client-Id` header on sync requests
- Used for echo filtering during pull (server excludes the requesting client's own operations)

### Password Hashing

- PBKDF2 with SHA-256, 100,000 iterations, 16-byte random salt
- Constant-time comparison for verification

---

## Database Schema (Backend)

All data tables use composite primary keys `(userId, id)` for complete per-user data isolation.

**Core tables**: `users`, `sessions`, `oauthAccounts`, `tempUsers`, `clients`

**Flashcard tables** (each with `seqNo` and `lastModifiedClient` for sync):

- `cards` — scheduling state (due, stability, difficulty, reps, lapses, state)
- `cardContents` — front/back text
- `cardDeleted` — deletion tombstone (LWW)
- `cardBookmarked` — bookmark flag (LWW)
- `cardSuspended` — suspension date (LWW)
- `decks` — name, description, deleted (LWW)
- `cardDecks` — card-to-deck membership with `clCount` (CLSet)
- `reviewLogs` — grade, state, duration, timestamps (grow-only)
- `reviewLogDeleted` — deletion tombstone for reviews (LWW)

**File tables**: `files` (metadata + checksum), `userStorageMetrics` (quota tracking with triggers)

---

## Review System

Uses the **FSRS (Free Spaced Repetition Scheduler)** algorithm via `ts-fsrs`:

- Card states: New, Learning, Review, Relearning
- Grades: Again (1), Hard (2), Good (3), Easy (4)
- Fuzzing enabled to avoid clustering
- Maximum interval capped at 100 days
- Review duration tracked in milliseconds
- Undo supported via a client-side stack (`undoGradeStack`) and `reviewLogDeleted` operations

---

## Routing

| Path             | Page                          |
| ---------------- | ----------------------------- |
| `/`              | Review (main study interface) |
| `/decks`         | Deck listing                  |
| `/decks/_all`    | All cards across decks        |
| `/decks/:deckId` | Single deck view              |
| `/saved`         | Bookmarked cards              |
| `/create`        | Create flashcard              |
| `/stats`         | Statistics & charts           |
| `/profile`       | User profile                  |
| `/images`        | Image management              |
| `/import`        | Import operations from JSON   |
| `/login-success` | OAuth redirect handler        |

---

## Deployment

- **Frontend**: Cloudflare Pages (via Wrangler)
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **File Storage**: Cloudflare R2
- **Email**: Resend
- **Migrations**: Drizzle Kit (`npm run gen` to generate, `npm run schema:remote` to apply)
