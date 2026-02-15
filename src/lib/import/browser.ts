import {
  bundleManifestSchema,
  type BundleCard,
  type BundleManifest,
} from "@/lib/import/bundle";
import { readZip } from "@/lib/import/zip";

export type ParsedBundle = {
  manifest: BundleManifest;
  entries: Map<string, Uint8Array>;
};

export async function parseBundleFile(file: File): Promise<ParsedBundle> {
  const data = new Uint8Array(await file.arrayBuffer());
  const entries = readZip(data);

  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) {
    throw new Error("Invalid bundle: manifest.json not found");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error("Invalid bundle: manifest.json is not valid JSON");
  }

  const manifest = bundleManifestSchema.parse(parsed);
  return { manifest, entries };
}

function getMimeType(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export function createFileFromBundleAsset(
  card: BundleCard,
  assetFilePath: string,
  entries: Map<string, Uint8Array>,
) {
  const bytes = entries.get(assetFilePath);
  if (!bytes) {
    throw new Error(
      `Bundle asset missing for ${card.source.file}:${card.source.lineStart} (${assetFilePath})`,
    );
  }

  const fileName = assetFilePath.split("/").at(-1) || "asset";
  return new File([bytes], fileName, {
    type: getMimeType(fileName),
  });
}

export function replacePlaceholderLinks(
  card: BundleCard,
  replacementMap: Map<string, string>,
) {
  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const replaceInMarkdown = (
    markdown: string,
    placeholder: string,
    replacement: string,
  ) => {
    if (!replacement.startsWith("![")) {
      return markdown.split(placeholder).join(replacement);
    }

    // If a replacement is already full markdown image syntax, replace the
    // whole image token to avoid nested links like ![alt](![alt](url)).
    const imageTokenPattern = new RegExp(
      `!\\[[^\\]]*\\]\\(${escapeRegExp(placeholder)}\\)`,
      "g",
    );
    const replacedImageToken = markdown.replace(imageTokenPattern, replacement);
    if (replacedImageToken !== markdown) {
      return replacedImageToken;
    }

    return markdown.split(placeholder).join(replacement);
  };

  let front = card.front;
  let back = card.back;

  for (const asset of card.assets) {
    const replacement = replacementMap.get(asset.placeholder);
    if (!replacement) {
      throw new Error(
        `No replacement URL found for placeholder ${asset.placeholder}`,
      );
    }

    front = replaceInMarkdown(front, asset.placeholder, replacement);
    back = replaceInMarkdown(back, asset.placeholder, replacement);
  }

  return { front, back };
}
