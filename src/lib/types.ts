import { Card } from "ts-fsrs";

export type CardWithMetadata = Card & {
  id: string;
  front: string;
  back: string;

  deleted: boolean;
  bookmarked: boolean;
  suspended?: Date;

  // Sibling grouping (for cloze/reverse cards from the same source note)
  noteId?: string;
  siblingTag?: string;

  // CRDT metadata
  cardLastModified: number;
  cardContentLastModified: number;
  cardDeletedLastModified: number;
  cardBookmarkedLastModified: number;
  cardSuspendedLastModified: number;
  cardMetadataLastModified: number;

  createdAt: number;
};

export type Deck = {
  id: string;
  name: string;
  description: string;
  deleted: boolean;
  lastModified: number;
};
