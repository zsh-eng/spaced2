# Flashcard Bundle Import Spec (v1)

This document defines a deterministic contract between:

1. A local compiler (`vault/note.md` -> `spaced-bundle-v1.zip`)
2. The app importer (`spaced-bundle-v1.zip` -> local operations + uploaded images)

Scope: keep the authoring workflow simple for Obsidian/Markdown users, with multiline cards and wiki-style image links.

## Goals

- Deterministic parse rules for LLM-generated text.
- Easy local image pasting via Obsidian links (for example `![[name.png]]`).
- Preview before import.
- Simple deck assignment during import (UI-selected decks).
- Strong validation and line-numbered errors.

## Non-Goals (v1)

- No subdeck hierarchy model changes.
- No direct plugin/backend coupling required.
- No CRDT/schema migration required.

## Bundle Format

File extension: `.zip`

Recommended default file name:

- `spaced-bundle-YYYYMMDD-HHmmss.zip` in current working directory.

Zip contents:

- `manifest.json` (required)
- `assets/...` (optional image files referenced by manifest)

## `manifest.json` Schema (v1)

```json
{
  "version": "spaced-bundle-v1",
  "generatedAt": "2026-02-14T00:00:00.000Z",
  "source": {
    "type": "obsidian",
    "vaultRoot": "/absolute/path/to/vault",
    "inputs": ["/absolute/path/to/vault/Notes/TL2.md"]
  },
  "cards": [
    {
      "front": "Question markdown with multiline support",
      "back": "Answer markdown with multiline support",
      "assets": [
        {
          "placeholder": "asset://img_1",
          "file": "assets/4a70f8f1-name.png",
          "alt": "Optional alt text"
        }
      ],
      "source": {
        "file": "Notes/TL2.md",
        "lineStart": 42,
        "lineEnd": 58
      }
    }
  ],
  "warnings": [
    {
      "code": "UNUSED_ASSET",
      "message": "Asset packaged but not referenced by any card",
      "file": "Notes/TL2.md",
      "line": 1
    }
  ]
}
```

### Field notes

- `front` and `back`: raw markdown (multiline preserved).
- `assets.placeholder`: token embedded in markdown, for example `![diagram](asset://img_1)`.
- `assets.file`: zip-local file path.
- `source.file/line*`: used for diagnostics and preview context only.

## Authoring Syntax

This section distinguishes what is implemented now (v1) vs a token-efficient
extension for multi-card generation (vNext).

### Current v1 syntax (implemented)

Card block format:

```md
Q: First line of question
More question lines...
A: First line of answer
More answer lines...

===
```

Rules:

- `Q:` starts the question block.
- First top-level `A:` after `Q:` starts the answer block.
- `===` ends the card block.
- Everything between markers is preserved verbatim (including newlines).
- Markers must start at column 1 (no leading spaces).
- Escape literal markers with backslash:
  - `\Q:`
  - `\A:`
  - `\===`

Delimiter formatting recommendation:

- Put a blank line before `===` in authored markdown.
- This avoids accidental Setext heading rendering in markdown viewers when
  answer text sits directly above `===`.

Accepted image link forms inside `front`/`back`:

- `![[name.png]]`
- `![[assets/name.png]]`
- `![](relative/path.png)`

Compiler rewrites these to placeholders (`asset://...`) and records asset mapping in `assets[]`.

### Proposed vNext syntax (token-efficient, multi-card)

Keep basic cards as default (no per-card `TYPE: basic` marker). Use a mode
marker only for non-default behavior.

Example basic card (still default):

```md
Q: What is the capital of France?
A: Paris

===
```

Example reverse-generation card:

```md
@reverse
Q: React hook for local state
A: useState

===
```

Example cloze-generation card:

```md
@cloze
Q: The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell.
A: Optional explanation shown on the answer side.

===
```

Cloze token syntax (Anki-compatible):

- `{{c1::text}}`
- `{{c2::text}}`
- `{{c1::text::hint}}`

Proposed expansion rules:

- One generated card per unique cloze index (`c1`, `c2`, ...).
- Multiple deletions with the same index appear on the same generated card.
- `@cloze` can be optional when cloze tokens are detected in `Q:`.
- `@reverse` generates two cards (`forward`, `reverse`) from one block.

## Obsidian Vault Discovery (simplified)

Input contract:

- User passes one or more markdown file paths (or globs) to compiler.

Vault root detection:

- For each input file, walk up ancestors to find `.obsidian/`.
- If found, use nearest ancestor as vault root.
- If not found, use directory of input file as vault root.

No mandatory explicit `--vault` flag in v1.

## Obsidian Attachment Resolution

Resolution order for wiki links:

1. Path relative to source note directory.
2. Obsidian attachment folder (`.obsidian/app.json` -> `attachmentFolderPath`) if configured.
3. Vault-wide basename search.

Ambiguity:

- If basename search returns more than one file, emit hard error `AMBIGUOUS_WIKI_LINK`.

Missing file:

- Emit hard error `ASSET_NOT_FOUND`.

## Compiler CLI Contract (v1)

Example:

```bash
bun run spaced-compile -- "notes/tl2.md"
bun run spaced-compile -- "notes/**/*.md"
```

Behavior:

- Input: one or more file/glob arguments.
- Output: auto-generated zip in current directory unless `--out` provided.
- Exit code:
  - `0` success (warnings allowed)
  - non-zero on any hard error
- Human-readable summary:
  - files scanned
  - cards parsed
  - assets packed
  - warnings/errors (file + line)

Optional flags:

- `--out <path>`
- `--strict` (treat warnings as errors)

## App Import Flow (v1)

1. User selects `.zip`.
2. Parse and validate `manifest.json`.
3. Preview UI:
   - card count
   - rendered `front/back`
   - validation errors/warnings
4. User selects deck(s) to add cards to:
   - default: previously used decks for faster repeated imports
   - allow empty selection with explicit confirmation
5. Upload `assets/*`, build URL map `asset://... -> https://...`.
6. Rewrite markdown placeholders in each card.
7. Resolve duplicate policy and show counts before final apply:
   - `create duplicates` (default)
   - `skip probable duplicates`
8. Create and apply operations locally:
   - `card`
   - `cardContent`
   - `updateDeckCard` for selected deck IDs
9. Show per-card result summary and totals.

## Error Model

Hard errors (block import):

- `INVALID_MANIFEST`
- `UNSUPPORTED_VERSION`
- `MALFORMED_CARD_BLOCK`
- `MISSING_ANSWER`
- `MISSING_DELIMITER`
- `ASSET_NOT_FOUND`
- `AMBIGUOUS_WIKI_LINK`
- `MISSING_ASSET_IN_ZIP`

Warnings (import can proceed):

- `POSSIBLE_DUPLICATE_CARD`
- `UNUSED_ASSET`
- `NO_DECK_SELECTED`

All diagnostics should include `file` and `line` when possible.

## Idempotency / Duplicate Handling

Background:

- In this app, `card.id` is generated client-side at create/import time.
- Re-importing the same bundle will create new card UUIDs unless duplicate handling is applied.

V1 policy:

- No compiler-generated UUIDs.
- No required `sourceCardId` in manifest.
- App computes `fingerprint = sha256(normalize(front) + "\n---\n" + normalize(back))` during preview/import, using pre-upload content (with `asset://...` placeholders).
- Duplicate policy is chosen in UI:
  - `create duplicates` (default, fastest, safest for scratch workflows)
  - `skip probable duplicates` (skip when fingerprint already exists in local DB)

Notes:

- Fingerprint matching is heuristic; identical Q/A pairs are treated as duplicates.
- This preserves current data model and avoids adding extra required manifest fields.
- Future optional mode can introduce explicit source-based upsert if needed.

## Source Lineage Metadata (Proposed vNext)

Goal: enable post-import one-shot editing of all cards generated from one source
note block while preserving per-card review state.

Proposed optional per-card field in `manifest.json`:

```json
{
  "front": "Question markdown",
  "back": "Answer markdown",
  "assets": [],
  "source": {
    "file": "Notes/TL2.md",
    "lineStart": 42,
    "lineEnd": 58
  },
  "origin": {
    "noteId": "8f7db17e-4e43-4ac7-b102-3189fdfd07a8",
    "noteType": "cloze",
    "variantKey": "c1",
    "noteRevision": "sha256:77c1f3..."
  }
}
```

Field semantics:

- `origin.noteId`: stable ID for the source note block (shared by all siblings).
- `origin.noteType`: generation type (`basic`, `reverse`, `cloze`).
- `origin.variantKey`: stable variant ID within a note (`basic`, `forward`,
  `reverse`, `c1`, `c2`, ...).
- `origin.noteRevision`: hash of normalized source block for change detection.

Why this enables one-shot editing:

- Imported cards with the same `origin.noteId` are siblings derived from one
  source note.
- Recompile + import can upsert by (`noteId`, `variantKey`) to update existing
  card content, not create a new card.
- Scheduler state stays attached to the same card IDs.

Migration path (minimal schema churn):

1. Compiler emits `origin` metadata for all generated cards.
2. Importer schema accepts optional `origin`; bundles without it remain valid.
3. App persists card-origin linkage via a new operation type (for sync safety)
   keyed by `cardId`, without changing FSRS card state schema.
4. Import adds optional "update existing by origin" mode:
   - If (`noteId`, `variantKey`) exists, write `cardContent` update.
   - Else create a new card.
5. Editor can add "Edit source group" for cards that have `origin`; cards
   without `origin` keep current per-card edit behavior.

## Test Plan (Bun test runner, mock vault fixtures)

### 1) Parser unit tests

- Parses single valid card with multiline `Q/A`.
- Parses multiple cards in one file.
- Preserves blank lines and markdown formatting.
- Handles escaped markers (`\A:`, `\===`).
- Errors on missing `A:`.
- Errors on missing `===`.
- Errors on empty `Q` or empty `A` (if enforced).

### 2) Obsidian link resolver unit tests

- Resolves `![[name.png]]` in note directory.
- Resolves via attachment folder from `.obsidian/app.json`.
- Resolves markdown relative path `![](../img/x.png)`.
- Errors on missing asset.
- Errors on ambiguous basename match.

### 3) Bundle builder unit tests

- Writes valid `manifest.json`.
- Packs all referenced assets under `assets/`.
- Rewrites markdown links to `asset://...`.
- Ensures placeholders are unique per card.

### 4) Importer unit/integration tests

- Rejects invalid zip/missing manifest.
- Rewrites placeholders after simulated upload map.
- Applies expected operation count per card.
- Applies selected deck IDs correctly.
- Duplicate policy:
  - `create duplicates` always imports.
  - `skip probable duplicates` skips known fingerprints.
- Reports partial failures with per-card diagnostics.

### 5) Fixture strategy

- Create `tests/fixtures/vault-basic/`:
  - `.obsidian/app.json`
  - `notes/tl2.md`
  - `assets/*.png`
- Create `tests/fixtures/vault-ambiguous/` with duplicate image names in different folders.
- Use temp directories for output bundle assertions.

## Suggested Implementation Order

1. Parser + diagnostics
2. Obsidian link resolver
3. Bundle writer (zip + manifest)
4. App preview/import UI
5. Duplicate-policy UX refinements
