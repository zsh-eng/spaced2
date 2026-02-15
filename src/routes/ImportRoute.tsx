import { useCards, useDecks } from "@/components/hooks/query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { constructImageMarkdownLink, uploadImage } from "@/lib/files/upload";
import {
  createFileFromBundleAsset,
  parseBundleFile,
  replacePlaceholderLinks,
} from "@/lib/import/browser";
import { createCardFingerprint } from "@/lib/import/fingerprint";
import { createNewCard, updateDeletedClientSide } from "@/lib/sync/operation";
import { cn } from "@/lib/utils";
import { Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const DECK_SELECTION_STORAGE_KEY = "bundle-import-selected-decks";

type DuplicatePolicy = "create" | "skip";

function loadSelectedDecksFromStorage() {
  try {
    const raw = localStorage.getItem(DECK_SELECTION_STORAGE_KEY);
    if (!raw) {
      return [] as string[];
    }

    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as string[];
  }
}

function persistSelectedDecks(deckIds: string[]) {
  try {
    localStorage.setItem(DECK_SELECTION_STORAGE_KEY, JSON.stringify(deckIds));
  } catch {
    // noop
  }
}

export default function ImportRoute() {
  const cards = useCards();
  const decks = useDecks().sort((a, b) => b.lastModified - a.lastModified);

  const [bundleName, setBundleName] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Awaited<
    ReturnType<typeof parseBundleFile>
  > | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [allowImportWithoutDeck, setAllowImportWithoutDeck] = useState(false);
  const [duplicatePolicy, setDuplicatePolicy] =
    useState<DuplicatePolicy>("create");
  const [selectedDecks, setSelectedDecks] = useState<string[]>(
    loadSelectedDecksFromStorage,
  );
  const [probableDuplicateCount, setProbableDuplicateCount] = useState(0);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [lastImportedCardIds, setLastImportedCardIds] = useState<string[]>([]);
  const [isUndoingImport, setIsUndoingImport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    persistSelectedDecks(selectedDecks);
  }, [selectedDecks]);

  useEffect(() => {
    let cancelled = false;

    async function computeProbableDuplicates() {
      if (!bundle) {
        setProbableDuplicateCount(0);
        return;
      }

      const existingFingerprints = new Set<string>();
      for (const card of cards) {
        existingFingerprints.add(
          await createCardFingerprint(card.front, card.back),
        );
      }

      let duplicates = 0;
      for (const card of bundle.manifest.cards) {
        const fingerprint = await createCardFingerprint(card.front, card.back);
        if (existingFingerprints.has(fingerprint)) {
          duplicates++;
        }
      }

      if (!cancelled) {
        setProbableDuplicateCount(duplicates);
      }
    }

    computeProbableDuplicates();

    return () => {
      cancelled = true;
    };
  }, [bundle, cards]);

  const bundleStats = useMemo(() => {
    if (!bundle) {
      return null;
    }

    const assetCount = bundle.manifest.cards.reduce(
      (count, card) => count + card.assets.length,
      0,
    );

    return {
      cards: bundle.manifest.cards.length,
      assets: assetCount,
      warnings: bundle.manifest.warnings.length,
    };
  }, [bundle]);

  const handleFile = async (file: File) => {
    try {
      setIsParsing(true);
      const parsed = await parseBundleFile(file);
      setBundle(parsed);
      setBundleName(file.name);
      setImportSummary(null);
      toast.success(`Loaded bundle with ${parsed.manifest.cards.length} cards`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Invalid bundle";
      toast.error("Failed to parse bundle", {
        description: message,
      });
      setBundle(null);
      setBundleName(null);
    } finally {
      setIsParsing(false);
    }
  };

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Only .zip bundles are supported");
      return;
    }

    await handleFile(file);
  };

  const onFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await handleFile(file);
  };

  const toggleDeckSelection = (deckId: string) => {
    setSelectedDecks((previous) => {
      if (previous.includes(deckId)) {
        return previous.filter((id) => id !== deckId);
      }

      return [...previous, deckId];
    });
  };

  const resetImportForm = () => {
    setBundle(null);
    setBundleName(null);
    setAllowImportWithoutDeck(false);
    setDuplicatePolicy("create");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const canImport =
    Boolean(bundle) &&
    (selectedDecks.length > 0 || allowImportWithoutDeck) &&
    !isParsing;

  const handleImport = async () => {
    if (!bundle) {
      return;
    }

    if (selectedDecks.length === 0 && !allowImportWithoutDeck) {
      toast.error("Select at least one deck or allow deck-less import");
      return;
    }

    const existingFingerprints = new Set<string>();
    for (const card of cards) {
      existingFingerprints.add(
        await createCardFingerprint(card.front, card.back),
      );
    }

    const uploadCache = new Map<string, Promise<string>>();
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const importedCardIds: string[] = [];

    try {
      setIsImporting(true);

      for (const card of bundle.manifest.cards) {
        try {
          const fingerprint = await createCardFingerprint(
            card.front,
            card.back,
          );
          if (
            duplicatePolicy === "skip" &&
            existingFingerprints.has(fingerprint)
          ) {
            skipped++;
            continue;
          }

          const replacementMap = new Map<string, string>();
          for (const asset of card.assets) {
            let urlPromise = uploadCache.get(asset.file);
            if (!urlPromise) {
              const file = createFileFromBundleAsset(
                card,
                asset.file,
                bundle.entries,
              );
              urlPromise = uploadImage(file, asset.alt).then((response) => {
                if (!response.success) {
                  throw new Error(response.error);
                }

                return constructImageMarkdownLink(response.fileKey, asset.alt);
              });
              uploadCache.set(asset.file, urlPromise);
            }

            replacementMap.set(asset.placeholder, await urlPromise);
          }

          const content = replacePlaceholderLinks(card, replacementMap);
          const cardId = await createNewCard(
            content.front,
            content.back,
            selectedDecks,
            card.origin
              ? {
                  noteId: card.origin.noteId,
                  siblingTag: card.origin.variantKey,
                }
              : undefined,
          );
          existingFingerprints.add(fingerprint);
          importedCardIds.push(cardId);
          imported++;
        } catch (error) {
          failed++;
          console.error(error);
        }
      }

      setImportSummary({ imported, skipped, failed });
      setLastImportedCardIds(importedCardIds);
      resetImportForm();
      toast.success("Bundle import finished", {
        description: `${imported} imported, ${skipped} skipped, ${failed} failed`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleUndoLastImport = async () => {
    if (lastImportedCardIds.length === 0) {
      return;
    }

    setIsUndoingImport(true);
    let undone = 0;
    let failed = 0;

    try {
      for (const cardId of lastImportedCardIds) {
        try {
          await updateDeletedClientSide(cardId, true);
          undone++;
        } catch (error) {
          failed++;
          console.error(error);
        }
      }

      if (undone > 0) {
        setLastImportedCardIds([]);
      }

      if (failed > 0) {
        toast.error("Undo import partially failed", {
          description: `${undone} reverted, ${failed} failed`,
        });
        return;
      }

      toast.success("Undid last import", {
        description: `${undone} imported cards marked as deleted`,
      });
    } finally {
      setIsUndoingImport(false);
    }
  };

  return (
    <div className="flex flex-col h-full col-start-1 col-end-13 xl:col-start-3 xl:col-end-11 md:px-24 pb-6 gap-4 animate-fade-in">
      <div className="flex flex-col items-center justify-center gap-3 py-6">
        <div className="flex flex-col gap-2 items-center mb-2">
          <div className="rounded-full bg-primary/10 p-3">
            <Upload className="size-6 text-primary" />
          </div>
          <h3 className="text-lg font-medium">Import Flashcards</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            Import cards from a compiled Obsidian bundle
            (`spaced-bundle-v1.zip`). Review cards before import, choose
            deck(s), and decide how duplicates are handled.
          </p>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-10 w-full max-w-2xl cursor-pointer transition-colors text-center",
            isDragging ? "border-primary" : "hover:border-primary",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={onFileInput}
            className="hidden"
          />
          <Upload className="size-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag and drop a bundle zip here, or click to select
          </p>
          {bundleName && (
            <p className="text-xs text-muted-foreground mt-2">
              Loaded: {bundleName}
            </p>
          )}
          {isParsing && (
            <div className="mt-3 flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" />
              Parsing bundle...
            </div>
          )}
        </div>
      </div>

      {importSummary && (
        <Card className="p-3 text-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Imported: {importSummary.imported}, skipped:{" "}
              {importSummary.skipped}, failed: {importSummary.failed}
            </div>
            {lastImportedCardIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleUndoLastImport}
                disabled={isUndoingImport}
              >
                {isUndoingImport ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Undoing...
                  </>
                ) : (
                  <>Undo Last Import</>
                )}
              </Button>
            )}
          </div>
        </Card>
      )}

      {bundle && bundleStats && (
        <div className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Cards</div>
              <div className="text-xl font-semibold">{bundleStats.cards}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Assets</div>
              <div className="text-xl font-semibold">{bundleStats.assets}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Warnings</div>
              <div className="text-xl font-semibold">
                {bundleStats.warnings}
              </div>
            </Card>
          </div>

          {bundle.manifest.warnings.length > 0 && (
            <Card className="p-3">
              <div className="text-sm font-medium mb-2">Compiler warnings</div>
              <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-1">
                {bundle.manifest.warnings.map((warning, index) => (
                  <div key={`${warning.code}-${index}`}>
                    {warning.code} {warning.file}:{warning.line} -{" "}
                    {warning.message}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-3 space-y-2">
            <div className="text-sm font-medium">Duplicate policy</div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={duplicatePolicy === "create" ? "default" : "outline"}
                size="sm"
                onClick={() => setDuplicatePolicy("create")}
              >
                Create duplicates
              </Button>
              <Button
                variant={duplicatePolicy === "skip" ? "default" : "outline"}
                size="sm"
                onClick={() => setDuplicatePolicy("skip")}
              >
                Skip probable duplicates
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Probable duplicates in this bundle: {probableDuplicateCount}
            </p>
          </Card>

          <Card className="p-3 space-y-2">
            <div className="text-sm font-medium">Deck assignment</div>
            <p className="text-xs text-muted-foreground">
              Select one or more decks. All imported cards are added to selected
              decks.
            </p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {decks.map((deck) => {
                const selected = selectedDecks.includes(deck.id);
                return (
                  <Button
                    key={deck.id}
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDeckSelection(deck.id)}
                  >
                    {deck.name}
                  </Button>
                );
              })}
              {decks.length === 0 && (
                <p className="text-xs text-muted-foreground">No decks found.</p>
              )}
            </div>

            <Button
              size="sm"
              variant={allowImportWithoutDeck ? "default" : "outline"}
              onClick={() => setAllowImportWithoutDeck((value) => !value)}
            >
              {allowImportWithoutDeck
                ? "Import without decks: enabled"
                : "Allow import without decks"}
            </Button>
          </Card>

          <Card className="p-3 space-y-2">
            <div className="text-sm font-medium">Preview</div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {bundle.manifest.cards.map((card, index) => (
                <Card key={`${card.source.file}-${index}`} className="p-3">
                  <div className="text-[11px] text-muted-foreground mb-2">
                    {card.source.file}:{card.source.lineStart}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium mb-1">Q</div>
                      <pre className="text-xs whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                        {card.front}
                      </pre>
                    </div>
                    <div>
                      <div className="text-xs font-medium mb-1">A</div>
                      <pre className="text-xs whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                        {card.back}
                      </pre>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleImport}
              disabled={!canImport || isImporting}
              className="min-w-44"
            >
              {isImporting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>Import {bundle.manifest.cards.length} Cards</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              {selectedDecks.length} deck{selectedDecks.length === 1 ? "" : "s"}{" "}
              selected
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
