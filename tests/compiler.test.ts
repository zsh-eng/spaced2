import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bundleManifestSchema } from "../src/lib/import/bundle";
import {
  findImageLinks,
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
