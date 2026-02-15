import { CardWithMetadata, Deck } from "@/lib/types";
import { createEmptyCard } from "ts-fsrs";

export const defaultCard: Omit<CardWithMetadata, "id"> = {
  ...createEmptyCard(),
  front: "",
  back: "",
  deleted: false,

  bookmarked: false,

  // CRDT metadata
  cardLastModified: 0,
  cardContentLastModified: 0,
  cardDeletedLastModified: 0,
  cardBookmarkedLastModified: 0,
  cardSuspendedLastModified: 0,
  cardMetadataLastModified: 0,

  createdAt: 0,
};

export const defaultDeck: Omit<Deck, "id"> = {
  name: "",
  description: "",
  deleted: false,
  lastModified: 0,
};
