import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bundleManifestSchema } from "../src/lib/import/bundle";
import {
  expandClozeText,
  findImageLinks,
  getClozeIndices,
  parseClozeMarkers,
  parseFlashcardBlocks,
} from "../src/lib/import/compiler-core";
import { replacePlaceholderLinks } from "../src/lib/import/browser";
import { createZip, readZip } from "../src/lib/import/zip";

const rootDir = process.cwd();

describe("parseFlashcardBlocks", () => {
  test("parses multiline cards", () => {
    const input = `Q: What is TL2?\nLine 2\nA: An STM\nLine B\n===`;
    const result = parseFlashcardBlocks(input, "note.md");

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.front).toBe("What is TL2?\nLine 2");
    expect(result.cards[0]?.back).toBe("An STM\nLine B");
    expect(
      result.diagnostics.filter((d) => d.severity === "error"),
    ).toHaveLength(0);
  });

  test("supports escaped markers", () => {
    const input = `Q: Keep literal \\A: marker\nA: Answer with \\=== literal\n===`;
    const result = parseFlashcardBlocks(input, "note.md");
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.front).toContain("A:");
    expect(result.cards[0]?.back).toContain("===");
  });

  test("basic cards get origin with noteType basic", () => {
    const input = `Q: Question\nA: Answer\n===`;
    const result = parseFlashcardBlocks(input, "note.md");
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.origin).toBeDefined();
    expect(result.cards[0]?.origin?.noteType).toBe("basic");
    expect(result.cards[0]?.origin?.variantKey).toBe("basic");
    expect(result.cards[0]?.origin?.noteId).toBeTruthy();
  });

  test("@reverse produces forward and reverse cards", () => {
    const input = `@reverse\nQ: Capital of France\nA: Paris\n\n===`;
    const result = parseFlashcardBlocks(input, "note.md");

    expect(result.cards).toHaveLength(2);
    expect(
      result.diagnostics.filter((d) => d.severity === "error"),
    ).toHaveLength(0);

    // Forward card
    expect(result.cards[0]?.front).toBe("Capital of France");
    expect(result.cards[0]?.back).toBe("Paris");
    expect(result.cards[0]?.origin?.noteType).toBe("reverse");
    expect(result.cards[0]?.origin?.variantKey).toBe("forward");

    // Reverse card
    expect(result.cards[1]?.front).toBe("Paris");
    expect(result.cards[1]?.back).toBe("Capital of France");
    expect(result.cards[1]?.origin?.noteType).toBe("reverse");
    expect(result.cards[1]?.origin?.variantKey).toBe("reverse");

    // Both share the same noteId
    expect(result.cards[0]?.origin?.noteId).toBe(
      result.cards[1]?.origin?.noteId,
    );
  });

  test("cloze markers produce one card per unique index", () => {
    const input = `Q: {{c1::Canberra}} was founded in {{c2::1913}}\nA: Review the facts.\n\n===`;
    const result = parseFlashcardBlocks(input, "note.md");

    expect(
      result.diagnostics.filter((d) => d.severity === "error"),
    ).toHaveLength(0);
    expect(result.cards).toHaveLength(2);

    // c1 card
    expect(result.cards[0]?.front).toBe("[...] was founded in 1913");
    expect(result.cards[0]?.origin?.noteType).toBe("cloze");
    expect(result.cards[0]?.origin?.variantKey).toBe("c1");

    // c2 card
    expect(result.cards[1]?.front).toBe("Canberra was founded in [...]");
    expect(result.cards[1]?.origin?.variantKey).toBe("c2");

    // Both share the same noteId
    expect(result.cards[0]?.origin?.noteId).toBe(
      result.cards[1]?.origin?.noteId,
    );
  });

  test("cloze with hints shows hint in brackets", () => {
    const input = `Q: The {{c1::mitochondria::organelle}} is the powerhouse.\nA: Answer.\n\n===`;
    const result = parseFlashcardBlocks(input, "note.md");

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.front).toBe(
      "The [hint: organelle] is the powerhouse.",
    );
  });

  test("cloze back shows revealed text with answer bolded, followed by A: text", () => {
    const input = `Q: {{c1::Canberra}} is the capital.\nA: Review.\n\n===`;
    const result = parseFlashcardBlocks(input, "note.md");

    expect(result.cards).toHaveLength(1);
    // Back = Q text with cloze revealed + A text
    expect(result.cards[0]?.back).toBe(
      "**Canberra** is the capital.\n\nReview.",
    );
  });

  test("multiple same-index clozes in one card", () => {
    const input = `Q: {{c1::A}} and {{c1::B}} are both important.\nA: Answer.\n\n===`;
    const result = parseFlashcardBlocks(input, "note.md");

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.front).toBe("[...] and [...] are both important.");
    expect(result.cards[0]?.origin?.variantKey).toBe("c1");
  });

  test("@reverse without following Q: is ignored", () => {
    const input = `@reverse\nSome random text\nQ: Question\nA: Answer\n\n===`;
    const result = parseFlashcardBlocks(input, "note.md");

    // @reverse without immediately following Q: should be ignored
    // The Q: on line 3 should be parsed as a basic card
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.origin?.noteType).toBe("basic");
  });

  test("mixed card types in one file", () => {
    const input = [
      "Q: Basic card",
      "A: Basic answer",
      "",
      "===",
      "",
      "@reverse",
      "Q: Forward",
      "A: Backward",
      "",
      "===",
      "",
      "Q: {{c1::Cloze}} card",
      "A: Cloze answer",
      "",
      "===",
    ].join("\n");

    const result = parseFlashcardBlocks(input, "note.md");
    expect(
      result.diagnostics.filter((d) => d.severity === "error"),
    ).toHaveLength(0);
    expect(result.cards).toHaveLength(4); // 1 basic + 2 reverse + 1 cloze

    expect(result.cards[0]?.origin?.noteType).toBe("basic");
    expect(result.cards[1]?.origin?.noteType).toBe("reverse");
    expect(result.cards[1]?.origin?.variantKey).toBe("forward");
    expect(result.cards[2]?.origin?.noteType).toBe("reverse");
    expect(result.cards[2]?.origin?.variantKey).toBe("reverse");
    expect(result.cards[3]?.origin?.noteType).toBe("cloze");

    // Each source block gets a different noteId
    expect(result.cards[0]?.origin?.noteId).not.toBe(
      result.cards[1]?.origin?.noteId,
    );
    expect(result.cards[1]?.origin?.noteId).not.toBe(
      result.cards[3]?.origin?.noteId,
    );
  });
});

describe("parseClozeMarkers", () => {
  test("parses basic cloze markers", () => {
    const matches = parseClozeMarkers("{{c1::hello}} world {{c2::foo}}");
    expect(matches).toHaveLength(2);
    expect(matches[0]?.index).toBe(1);
    expect(matches[0]?.answer).toBe("hello");
    expect(matches[0]?.hint).toBeUndefined();
    expect(matches[1]?.index).toBe(2);
    expect(matches[1]?.answer).toBe("foo");
  });

  test("parses cloze with hint", () => {
    const matches = parseClozeMarkers("{{c1::answer::hint text}}");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.answer).toBe("answer");
    expect(matches[0]?.hint).toBe("hint text");
  });

  test("returns empty for no cloze markers", () => {
    const matches = parseClozeMarkers("Just plain text");
    expect(matches).toHaveLength(0);
  });
});

describe("getClozeIndices", () => {
  test("returns sorted unique indices", () => {
    const indices = getClozeIndices("{{c2::b}} {{c1::a}} {{c2::c}}");
    expect(indices).toEqual([1, 2]);
  });

  test("returns empty for no cloze", () => {
    const indices = getClozeIndices("No cloze here");
    expect(indices).toEqual([]);
  });
});

describe("expandClozeText", () => {
  test("replaces active cloze with blank on front", () => {
    const { front } = expandClozeText("{{c1::hello}} world", 1);
    expect(front).toBe("[...] world");
  });

  test("shows inactive cloze text normally on front", () => {
    const { front } = expandClozeText("{{c1::hello}} {{c2::world}}", 1);
    expect(front).toBe("[...] world");
  });

  test("shows hint in brackets when present", () => {
    const { front } = expandClozeText("{{c1::answer::my hint}}", 1);
    expect(front).toBe("[hint: my hint]");
  });

  test("bolds active cloze answer on back", () => {
    const { back } = expandClozeText("{{c1::hello}} world", 1);
    expect(back).toBe("**hello** world");
  });

  test("shows inactive cloze text normally on back", () => {
    const { back } = expandClozeText("{{c1::hello}} {{c2::world}}", 1);
    expect(back).toBe("**hello** world");
  });

  test("handles multiple same-index clozes", () => {
    const { front, back } = expandClozeText("{{c1::A}} and {{c1::B}}", 1);
    expect(front).toBe("[...] and [...]");
    expect(back).toBe("**A** and **B**");
  });
});

describe("findImageLinks", () => {
  test("extracts wiki and markdown links", () => {
    const input = `![[diagram.png]]\n![Alt](../assets/lock.png)`;
    const links = findImageLinks(input);
    expect(links).toHaveLength(2);
    expect(links[0]?.kind).toBe("wiki");
    expect(links[1]?.kind).toBe("markdown");
    expect(links[1]?.alt).toBe("Alt");
  });
});

describe("zip", () => {
  test("round-trips entries", () => {
    const zip = createZip([
      { name: "manifest.json", data: new TextEncoder().encode("{}") },
      { name: "assets/a.txt", data: new TextEncoder().encode("hello") },
    ]);

    const parsed = readZip(zip);
    expect(parsed.get("manifest.json")).toBeDefined();
    expect(new TextDecoder().decode(parsed.get("assets/a.txt")!)).toBe("hello");
  });
});

describe("compiler CLI", () => {
  test("creates bundle from fixture vault", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "spaced-compile-"));
    const outFile = path.join(tempDir, "bundle.zip");
    const input = path.join(rootDir, "tests/fixtures/vault-basic/notes/tl2.md");

    const proc = Bun.spawnSync(
      ["bun", "run", "./scripts/spaced-compile.ts", "--out", outFile, input],
      {
        cwd: rootDir,
        stderr: "pipe",
        stdout: "pipe",
      },
    );

    expect(proc.exitCode).toBe(0);
    const zipBytes = new Uint8Array(await readFile(outFile));
    const entries = readZip(zipBytes);
    const manifestRaw = entries.get("manifest.json");
    expect(manifestRaw).toBeDefined();

    const manifest = bundleManifestSchema.parse(
      JSON.parse(new TextDecoder().decode(manifestRaw!)),
    );

    expect(manifest.cards.length).toBe(2);
    expect(entries.has("assets")).toBe(false);
    expect(
      manifest.cards.some((card) =>
        card.assets.some((asset) => asset.placeholder.startsWith("asset://")),
      ),
    ).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });

  test("fails on ambiguous wiki links", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "spaced-compile-"));
    const outFile = path.join(tempDir, "bundle.zip");
    const input = path.join(
      rootDir,
      "tests/fixtures/vault-ambiguous/notes/ambiguous.md",
    );

    const proc = Bun.spawnSync(
      ["bun", "run", "./scripts/spaced-compile.ts", "--out", outFile, input],
      {
        cwd: rootDir,
        stderr: "pipe",
        stdout: "pipe",
      },
    );

    expect(proc.exitCode).toBe(1);
    const stderr = new TextDecoder().decode(proc.stderr);
    expect(stderr).toContain("AMBIGUOUS_WIKI_LINK");

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("replacePlaceholderLinks", () => {
  test("does not nest markdown image syntax when replacing placeholders", () => {
    const card = {
      front: "Prompt",
      back: "world\n![Pasted image 20251028151139](asset://img_1)",
      assets: [
        {
          placeholder: "asset://img_1",
          file: "assets/hash-pasted.png",
          alt: "Pasted image 20251028151139",
        },
      ],
      source: {
        file: "note.md",
        lineStart: 1,
        lineEnd: 3,
      },
    };

    const replacementMap = new Map<string, string>([
      [
        "asset://img_1",
        "![Pasted image 20251028151139](http://localhost:8787/api/files/file-123)",
      ],
    ]);

    const content = replacePlaceholderLinks(card, replacementMap);
    expect(content.back).toBe(
      "world\n![Pasted image 20251028151139](http://localhost:8787/api/files/file-123)",
    );
  });
});
