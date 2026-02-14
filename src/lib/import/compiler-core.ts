export type CompilerDiagnosticCode =
  | "MALFORMED_CARD_BLOCK"
  | "MISSING_ANSWER"
  | "MISSING_DELIMITER"
  | "ASSET_NOT_FOUND"
  | "AMBIGUOUS_WIKI_LINK"
  | "NO_CARDS_FOUND";

export type CompilerDiagnostic = {
  code: CompilerDiagnosticCode;
  message: string;
  file: string;
  line: number;
  severity: "error" | "warning";
};

export type ParsedCardBlock = {
  front: string;
  back: string;
  source: {
    file: string;
    lineStart: number;
    lineEnd: number;
  };
};

function isQuestionMarker(line: string) {
  return line.startsWith("Q:") && !line.startsWith("\\Q:");
}

function isAnswerMarker(line: string) {
  return line.startsWith("A:") && !line.startsWith("\\A:");
}

function isDelimiterMarker(line: string) {
  return line === "===";
}

function lineWithoutMarker(line: string, markerLength: number) {
  const rest = line.slice(markerLength);
  if (rest.startsWith(" ")) {
    return rest.slice(1);
  }
  return rest;
}

function unescapeMarkers(text: string) {
  return text.replace(/^\\(Q:|A:|===)/gm, "$1");
}

export function parseFlashcardBlocks(
  content: string,
  sourceFile: string,
): {
  cards: ParsedCardBlock[];
  diagnostics: CompilerDiagnostic[];
} {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const cards: ParsedCardBlock[] = [];
  const diagnostics: CompilerDiagnostic[] = [];

  let i = 0;
  while (i < lines.length) {
    if (!isQuestionMarker(lines[i])) {
      i++;
      continue;
    }

    const lineStart = i + 1;
    const frontLines = [lineWithoutMarker(lines[i], 2)];
    i++;

    let hasAnswer = false;
    while (i < lines.length) {
      if (isAnswerMarker(lines[i])) {
        hasAnswer = true;
        break;
      }

      if (isDelimiterMarker(lines[i])) {
        diagnostics.push({
          code: "MISSING_ANSWER",
          message: "Card block is missing an A: answer marker.",
          file: sourceFile,
          line: lineStart,
          severity: "error",
        });
        i++;
        break;
      }

      frontLines.push(lines[i]);
      i++;
    }

    if (!hasAnswer) {
      if (i >= lines.length) {
        diagnostics.push({
          code: "MISSING_ANSWER",
          message: "Card block is missing an A: answer marker.",
          file: sourceFile,
          line: lineStart,
          severity: "error",
        });
      }
      continue;
    }

    const backLines = [lineWithoutMarker(lines[i], 2)];
    i++;

    let lineEnd = -1;
    while (i < lines.length) {
      if (isDelimiterMarker(lines[i])) {
        lineEnd = i + 1;
        i++;
        break;
      }
      backLines.push(lines[i]);
      i++;
    }

    if (lineEnd === -1) {
      diagnostics.push({
        code: "MISSING_DELIMITER",
        message: "Card block is missing a terminating === delimiter.",
        file: sourceFile,
        line: lineStart,
        severity: "error",
      });
      break;
    }

    const front = unescapeMarkers(frontLines.join("\n")).trim();
    const back = unescapeMarkers(backLines.join("\n")).trim();

    if (!front || !back) {
      diagnostics.push({
        code: "MALFORMED_CARD_BLOCK",
        message: "Card block must have non-empty Q and A content.",
        file: sourceFile,
        line: lineStart,
        severity: "error",
      });
      continue;
    }

    cards.push({
      front,
      back,
      source: {
        file: sourceFile,
        lineStart,
        lineEnd,
      },
    });
  }

  if (cards.length === 0) {
    diagnostics.push({
      code: "NO_CARDS_FOUND",
      message: "No flashcards found in file.",
      file: sourceFile,
      line: 1,
      severity: "warning",
    });
  }

  return { cards, diagnostics };
}

export type ImageLinkMatch = {
  raw: string;
  start: number;
  end: number;
  line: number;
  kind: "wiki" | "markdown";
  alt: string;
  target: string;
};

function computeLineStarts(input: string) {
  const starts = [0];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function offsetToLine(offset: number, lineStarts: number[]) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return high + 1;
}

function normalizeWikiTarget(target: string) {
  const withoutAlias = target.split("|")[0] ?? target;
  return withoutAlias.trim();
}

function normalizeMarkdownTarget(target: string) {
  const trimmed = target.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function findImageLinks(markdown: string): ImageLinkMatch[] {
  const lineStarts = computeLineStarts(markdown);
  const pattern = /!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(([^)]+)\)/g;
  const matches: ImageLinkMatch[] = [];

  for (const match of markdown.matchAll(pattern)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const line = offsetToLine(start, lineStarts);

    if (match[1] !== undefined) {
      matches.push({
        raw,
        start,
        end: start + raw.length,
        line,
        kind: "wiki",
        alt: "",
        target: normalizeWikiTarget(match[1]),
      });
      continue;
    }

    matches.push({
      raw,
      start,
      end: start + raw.length,
      line,
      kind: "markdown",
      alt: match[2] ?? "",
      target: normalizeMarkdownTarget(match[3] ?? ""),
    });
  }

  return matches;
}
