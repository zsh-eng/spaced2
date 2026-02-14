#!/usr/bin/env bun
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  type BundleAsset,
  type BundleCard,
  type BundleManifest,
  SPACED_BUNDLE_VERSION,
} from "../src/lib/import/bundle";
import {
  type CompilerDiagnostic,
  findImageLinks,
  parseFlashcardBlocks,
} from "../src/lib/import/compiler-core";
import { createZip } from "../src/lib/import/zip";

type CliOptions = {
  out?: string;
  strict: boolean;
  inputs: string[];
};

type VaultContext = {
  root: string;
  attachmentFolder?: string;
  basenameIndex: Map<string, string[]>;
};

type ResolvedAsset =
  | { kind: "external"; original: string }
  | { kind: "local"; absolutePath: string };

function toPosix(input: string) {
  return input.split(path.sep).join("/");
}

function isGlobPattern(input: string) {
  return /[*?[\]{}]/.test(input);
}

function normalizeBunArgs(argv: string[]) {
  const args = [...argv];
  let start = 0;

  // Handles direct execution and `bun run ...`.
  if (args[start] && (args[start] === "bun" || args[start].endsWith("/bun"))) {
    start++;
  }
  if (args[start] === "run") {
    start++;
  }
  if (args[start] && !args[start].startsWith("-")) {
    start++;
  }

  return args.slice(start);
}

function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: normalizeBunArgs(argv),
    options: {
      out: {
        type: "string",
      },
      strict: {
        type: "boolean",
      },
    },
    allowPositionals: true,
    strict: true,
  });

  const options: CliOptions = {
    out: values.out,
    strict: values.strict ?? false,
    inputs: positionals,
  };

  if (options.inputs.length === 0) {
    throw new Error(
      "No inputs provided. Example: bun run spaced-compile -- 'notes/**/*.md'",
    );
  }

  return options;
}

async function expandInputs(inputs: string[]): Promise<string[]> {
  const expanded = new Set<string>();

  for (const input of inputs) {
    if (isGlobPattern(input)) {
      const glob = new Bun.Glob(input);
      for await (const match of glob.scan({
        cwd: process.cwd(),
        absolute: true,
        onlyFiles: true,
      })) {
        if (match.toLowerCase().endsWith(".md")) {
          expanded.add(path.resolve(match));
        }
      }
      continue;
    }

    const absolute = path.resolve(input);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      throw new Error(
        `Input must be a markdown file or glob, got directory: ${input}`,
      );
    }

    if (absolute.toLowerCase().endsWith(".md")) {
      expanded.add(absolute);
    }
  }

  return [...expanded].sort();
}

async function existsFile(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function existsDirectory(dirPath: string) {
  try {
    const info = await stat(dirPath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function findVaultRoot(inputFile: string): Promise<string> {
  let current = path.dirname(inputFile);

  while (true) {
    const obsidianDir = path.join(current, ".obsidian");
    if (await existsDirectory(obsidianDir)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.dirname(inputFile);
    }

    current = parent;
  }
}

async function listAllFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const children = await readdir(current, { withFileTypes: true });
    for (const child of children) {
      const absolute = path.join(current, child.name);
      if (child.isDirectory()) {
        stack.push(absolute);
      } else if (child.isFile()) {
        result.push(absolute);
      }
    }
  }

  return result;
}

async function readAttachmentFolder(
  vaultRoot: string,
): Promise<string | undefined> {
  const appJsonPath = path.join(vaultRoot, ".obsidian", "app.json");
  if (!(await existsFile(appJsonPath))) {
    return undefined;
  }

  try {
    const content = await readFile(appJsonPath, "utf8");
    const parsed = JSON.parse(content) as { attachmentFolderPath?: unknown };
    if (
      typeof parsed.attachmentFolderPath === "string" &&
      parsed.attachmentFolderPath.trim() !== ""
    ) {
      return parsed.attachmentFolderPath;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function createVaultContext(vaultRoot: string): Promise<VaultContext> {
  const files = await listAllFiles(vaultRoot);
  const basenameIndex = new Map<string, string[]>();

  for (const file of files) {
    const base = path.basename(file).toLowerCase();
    const existing = basenameIndex.get(base) ?? [];
    existing.push(file);
    basenameIndex.set(base, existing);
  }

  return {
    root: vaultRoot,
    attachmentFolder: await readAttachmentFolder(vaultRoot),
    basenameIndex,
  };
}

function isExternalTarget(target: string) {
  return /^https?:\/\//i.test(target) || /^data:/i.test(target);
}

function toCandidatePath(basePath: string, target: string) {
  return path.resolve(basePath, target);
}

async function resolveAssetPath(
  context: VaultContext,
  sourceFile: string,
  target: string,
  kind: "wiki" | "markdown",
): Promise<
  | { ok: true; result: ResolvedAsset }
  | {
      ok: false;
      code: "ASSET_NOT_FOUND" | "AMBIGUOUS_WIKI_LINK";
      message: string;
    }
> {
  if (isExternalTarget(target)) {
    return { ok: true, result: { kind: "external", original: target } };
  }

  const normalizedTarget = decodeURIComponent(target.trim());
  const candidates = new Set<string>();
  const sourceDir = path.dirname(sourceFile);

  const hasPathSeparator =
    normalizedTarget.includes("/") || normalizedTarget.includes("\\");

  if (kind === "markdown" && normalizedTarget.startsWith("/")) {
    candidates.add(path.resolve(context.root, normalizedTarget.slice(1)));
  } else {
    candidates.add(toCandidatePath(sourceDir, normalizedTarget));
  }

  if (context.attachmentFolder) {
    candidates.add(
      path.resolve(context.root, context.attachmentFolder, normalizedTarget),
    );
  }

  if (hasPathSeparator) {
    candidates.add(path.resolve(context.root, normalizedTarget));
  }

  for (const candidate of candidates) {
    if (await existsFile(candidate)) {
      return { ok: true, result: { kind: "local", absolutePath: candidate } };
    }
  }

  const basename = path.basename(normalizedTarget).toLowerCase();
  const basenameMatches = context.basenameIndex.get(basename) ?? [];

  if (basenameMatches.length === 1) {
    return {
      ok: true,
      result: { kind: "local", absolutePath: basenameMatches[0] },
    };
  }

  if (basenameMatches.length > 1) {
    return {
      ok: false,
      code: "AMBIGUOUS_WIKI_LINK",
      message: `Multiple files matched ${target}: ${basenameMatches
        .map((file) => toPosix(path.relative(context.root, file)))
        .join(", ")}`,
    };
  }

  return {
    ok: false,
    code: "ASSET_NOT_FOUND",
    message: `Could not resolve image link: ${target}`,
  };
}

async function hashBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

type AssetRegistry = {
  byAbsolutePath: Map<string, { zipPath: string; bytes: Uint8Array }>;
};

async function registerAsset(
  registry: AssetRegistry,
  absolutePath: string,
): Promise<{ zipPath: string; bytes: Uint8Array }> {
  const existing = registry.byAbsolutePath.get(absolutePath);
  if (existing) {
    return existing;
  }

  const bytes = await readFile(absolutePath);
  const hash = await hashBytes(bytes);
  const baseName = sanitizeFileName(path.basename(absolutePath));
  const zipPath = `assets/${hash}-${baseName}`;
  const entry = {
    zipPath,
    bytes: new Uint8Array(bytes),
  };

  registry.byAbsolutePath.set(absolutePath, entry);
  return entry;
}

function getDefaultAltText(originalTarget: string) {
  return path.parse(originalTarget).name || "Image";
}

async function rewriteMarkdownAssets(
  markdown: string,
  sourceFileAbsolutePath: string,
  sourceFileDisplayPath: string,
  sourceLineBase: number,
  context: VaultContext,
  registry: AssetRegistry,
): Promise<{
  rewritten: string;
  assets: BundleAsset[];
  diagnostics: CompilerDiagnostic[];
}> {
  const links = findImageLinks(markdown);
  if (links.length === 0) {
    return { rewritten: markdown, assets: [], diagnostics: [] };
  }

  const diagnostics: CompilerDiagnostic[] = [];
  const assets: BundleAsset[] = [];
  let output = "";
  let cursor = 0;

  for (const link of links) {
    output += markdown.slice(cursor, link.start);
    cursor = link.end;

    const resolved = await resolveAssetPath(
      context,
      sourceFileAbsolutePath,
      link.target,
      link.kind,
    );

    if (!resolved.ok) {
      diagnostics.push({
        code: resolved.code,
        message: resolved.message,
        file: sourceFileDisplayPath,
        line: sourceLineBase + link.line - 1,
        severity: "error",
      });
      output += link.raw;
      continue;
    }

    if (resolved.result.kind === "external") {
      output += link.raw;
      continue;
    }

    const registered = await registerAsset(
      registry,
      resolved.result.absolutePath,
    );
    const placeholder = `asset://img_${assets.length + 1}`;
    const alt =
      link.kind === "markdown"
        ? link.alt || getDefaultAltText(link.target)
        : getDefaultAltText(link.target);

    assets.push({
      placeholder,
      file: registered.zipPath,
      alt,
    });

    output += `![${alt}](${placeholder})`;
  }

  output += markdown.slice(cursor);

  return {
    rewritten: output,
    assets,
    diagnostics,
  };
}

function timestampForFileName(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function printDiagnostics(diagnostics: CompilerDiagnostic[]) {
  for (const diagnostic of diagnostics) {
    const tag = diagnostic.severity === "error" ? "ERROR" : "WARN";
    console.error(
      `[${tag}] ${diagnostic.code} ${diagnostic.file}:${diagnostic.line} ${diagnostic.message}`,
    );
  }
}

async function main() {
  const options = parseCliArgs(Bun.argv);
  const inputFiles = await expandInputs(options.inputs);

  if (inputFiles.length === 0) {
    throw new Error("No markdown files matched the provided inputs.");
  }

  const vaultRoots = new Set<string>();
  for (const file of inputFiles) {
    vaultRoots.add(await findVaultRoot(file));
  }

  if (vaultRoots.size !== 1) {
    throw new Error(
      `All inputs must belong to the same vault. Found ${vaultRoots.size} roots.`,
    );
  }

  const vaultRoot = [...vaultRoots][0];
  const vaultContext = await createVaultContext(vaultRoot);

  const diagnostics: CompilerDiagnostic[] = [];
  const cards: BundleCard[] = [];
  const assetRegistry: AssetRegistry = {
    byAbsolutePath: new Map(),
  };

  for (const absoluteFile of inputFiles) {
    const relativeFile = toPosix(path.relative(vaultRoot, absoluteFile));
    const content = await readFile(absoluteFile, "utf8");
    const parsed = parseFlashcardBlocks(content, relativeFile);
    diagnostics.push(...parsed.diagnostics);

    for (const parsedCard of parsed.cards) {
      const frontResult = await rewriteMarkdownAssets(
        parsedCard.front,
        absoluteFile,
        relativeFile,
        parsedCard.source.lineStart,
        vaultContext,
        assetRegistry,
      );

      const backResult = await rewriteMarkdownAssets(
        parsedCard.back,
        absoluteFile,
        relativeFile,
        parsedCard.source.lineStart,
        vaultContext,
        assetRegistry,
      );

      diagnostics.push(...frontResult.diagnostics, ...backResult.diagnostics);

      cards.push({
        front: frontResult.rewritten,
        back: backResult.rewritten,
        assets: [...frontResult.assets, ...backResult.assets],
        source: parsedCard.source,
      });
    }
  }

  const hardErrors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );

  if (hardErrors.length > 0 || (options.strict && warnings.length > 0)) {
    printDiagnostics(diagnostics);
    const reason = hardErrors.length > 0 ? "errors" : "warnings with --strict";
    throw new Error(`Compilation failed due to ${reason}.`);
  }

  const now = new Date();
  const outputPath = options.out
    ? path.resolve(options.out)
    : path.resolve(
        process.cwd(),
        `spaced-bundle-${timestampForFileName(now)}.zip`,
      );

  const manifest: BundleManifest = {
    version: SPACED_BUNDLE_VERSION,
    generatedAt: now.toISOString(),
    source: {
      type: "obsidian",
      vaultRoot,
      inputs: inputFiles,
    },
    cards,
    warnings: warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      file: warning.file,
      line: warning.line,
    })),
  };

  const encoder = new TextEncoder();
  const entries = [
    {
      name: "manifest.json",
      data: encoder.encode(JSON.stringify(manifest, null, 2)),
    },
    ...[...assetRegistry.byAbsolutePath.values()].map((asset) => ({
      name: asset.zipPath,
      data: asset.bytes,
    })),
  ];

  const zipBytes = createZip(entries);
  await writeFile(outputPath, zipBytes);

  console.log(`Bundle created: ${outputPath}`);
  console.log(`Files scanned: ${inputFiles.length}`);
  console.log(`Cards parsed: ${cards.length}`);
  console.log(`Assets packed: ${assetRegistry.byAbsolutePath.size}`);
  console.log(`Warnings: ${warnings.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
