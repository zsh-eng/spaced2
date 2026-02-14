import { z } from "zod";

export const SPACED_BUNDLE_VERSION = "spaced-bundle-v1" as const;

export const bundleWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().positive(),
});

export const bundleAssetSchema = z.object({
  placeholder: z.string().startsWith("asset://"),
  file: z.string().startsWith("assets/"),
  alt: z.string().optional(),
});

export const bundleCardSourceSchema = z.object({
  file: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
});

export const bundleCardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  assets: z.array(bundleAssetSchema),
  source: bundleCardSourceSchema,
});

export const bundleSourceSchema = z.object({
  type: z.literal("obsidian"),
  vaultRoot: z.string().min(1),
  inputs: z.array(z.string().min(1)).min(1),
});

export const bundleManifestSchema = z.object({
  version: z.literal(SPACED_BUNDLE_VERSION),
  generatedAt: z.string().datetime(),
  source: bundleSourceSchema,
  cards: z.array(bundleCardSchema),
  warnings: z.array(bundleWarningSchema).default([]),
});

export type BundleWarning = z.infer<typeof bundleWarningSchema>;
export type BundleAsset = z.infer<typeof bundleAssetSchema>;
export type BundleCard = z.infer<typeof bundleCardSchema>;
export type BundleManifest = z.infer<typeof bundleManifestSchema>;
