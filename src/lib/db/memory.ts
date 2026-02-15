// This in-memory database is the data store for cards.
// We only persist operations, which are applied again every time we restart the app.
// An in-memory database is faster than fetching from IndexeDB whenever we need cards.
import { db } from "@/lib/db/persistence";
import { handleClientOperation, OperationWithId } from "@/lib/sync/operation";
import { CardWithMetadata, Deck } from "@/lib/types";
import { Card } from "ts-fsrs";

export type UndoGrade = {
  card: Card;
  cardId: string;
  reviewLogId: string;
};

type InternalMemoryDB = {
  cards: Record<string, CardWithMetadata>;
  decks: Record<string, Deck>;
  decksToCards: Record<string, Record<string, number>>;
  noteIdToCardIds: Record<string, string[]>;
  operations: Record<string, OperationWithId>;
  metadataKv: Record<string, unknown>;

  /**
   * "Undo" actions are stored in a stack.
   *
   * When an undo is executed, the review log is marked as deleted an the card
   * is restored to its original state.
   */
  undoGradeStack: UndoGrade[];
};

export type Snapshot = {
  putCard: (card: CardWithMetadata) => void;
  getCardById: (id: string) => CardWithMetadata | undefined;
  getCards: () => CardWithMetadata[];
  putDeck: (deck: Deck) => void;
  getDeckById: (id: string) => Deck | undefined;
  getDecks: () => Deck[];
  getCardsForDeck: (deckId: string) => CardWithMetadata[];
  getUndoStack: () => UndoGrade[];
};

const memoryDb: InternalMemoryDB = {
  cards: {},
  decks: {},
  decksToCards: {},
  noteIdToCardIds: {},
  operations: {},
  metadataKv: {},
  undoGradeStack: [],
};

const subscribers = new Set<() => void>();

const subscribe = (callback: () => void = () => {}): (() => void) => {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
};

let notifyCount = 0;
const notify = () => {
  // Create a new object reference so that we can pass it to the `useSyncExternalStore` hook
  snapshot = Object.assign({}, snapshot);
  notifyCount++;

  for (const callback of subscribers) {
    callback();
  }
};

// Memoize a function to avoid recomputing the same value.
// Invalidated when
function memoize<T extends (...args: never[]) => unknown>(fn: T) {
  let result: ReturnType<T>;
  let currentCount = notifyCount;
  return (...args: Parameters<T>) => {
    if (!result || currentCount !== notifyCount) {
      currentCount = notifyCount;
      result = fn(...args) as ReturnType<T>;
    }
    return result;
  };
}

const putCard = (card: CardWithMetadata) => {
  const existing = memoryDb.cards[card.id];

  // Maintain noteIdToCardIds index
  if (existing?.noteId && existing.noteId !== card.noteId) {
    const oldList = memoryDb.noteIdToCardIds[existing.noteId];
    if (oldList) {
      memoryDb.noteIdToCardIds[existing.noteId] = oldList.filter(
        (id) => id !== card.id,
      );
    }
  }
  if (card.noteId) {
    const list = memoryDb.noteIdToCardIds[card.noteId];
    if (!list) {
      memoryDb.noteIdToCardIds[card.noteId] = [card.id];
    } else if (!list.includes(card.id)) {
      list.push(card.id);
    }
  }

  memoryDb.cards[card.id] = Object.assign({}, card);
};

/**
 * Returns a card by its id.
 * Includes deleted cards.
 */
const getCardById = (id: string) => {
  return memoryDb.cards[id];
};

/**
 * Returns all cards.
 * Does not include deleted cards.
 */
const getCards = memoize(() => {
  return Object.values(memoryDb.cards).filter((card) => !card.deleted);
});

const putDeck = (deck: Deck) => {
  memoryDb.decks[deck.id] = Object.assign({}, deck);
};

/**
 * Returns a deck by its id.
 * Includes deleted decks.
 */
const getDeckById = (id: string) => {
  return memoryDb.decks[id];
};

/**
 * Returns all decks.
 * Does not include deleted decks.
 */
const getDecks = memoize(() => {
  return Object.values(memoryDb.decks).filter((deck) => !deck.deleted);
});

/**
 * Returns all cards for a deck.
 * Does not include deleted cards.
 */
const getCardsForDeck = (deckId: string) => {
  const cardsMap = memoryDb.decksToCards[deckId];
  if (!cardsMap) {
    return [];
  }

  const cards = Object.entries(cardsMap)
    .filter(([, count]) => count % 2 == 1) // Count is even when CL set shows that card is added to the deck
    .map(([cardId]) => memoryDb.cards[cardId])
    .filter((card) => !card.deleted);

  return cards;
};

/**
 * Returns IDs of sibling cards (cards sharing the same noteId), excluding the given card.
 */
const getSiblingCardIds = (cardId: string): string[] => {
  const card = memoryDb.cards[cardId];
  if (!card?.noteId) return [];
  const siblings = memoryDb.noteIdToCardIds[card.noteId] ?? [];
  return siblings.filter((id) => id !== cardId);
};

const pushUndoGrade = (undo: UndoGrade) => {
  memoryDb.undoGradeStack.push(undo);
};

const popUndoGrade = () => {
  if (memoryDb.undoGradeStack.length === 0) {
    return null;
  }

  return memoryDb.undoGradeStack.pop();
};

const getUndoStack = () => {
  return memoryDb.undoGradeStack;
};

let snapshot: Snapshot = {
  putCard,
  getCardById,
  getCards,
  putDeck,
  getDeckById,
  getDecks,
  getCardsForDeck,
  getUndoStack,
};

/**
 * Returns a snapshot of the current state of the database.
 *
 * This is used by the `useSyncExternalStore` hook to subscribe to changes.
 */
const getSnapshot = () => {
  return snapshot;
};

const MemoryDB = {
  subscribe,
  notify,
  getSnapshot,
  _db: memoryDb,

  putCard,
  getCards,
  getCardById,
  putDeck,
  getDeckById,
  getDecks,
  getCardsForDeck,
  getSiblingCardIds,
  pushUndoGrade,
  popUndoGrade,
};

export default MemoryDB;

async function init() {
  const operations = await db.operations.toArray();
  for (const operation of operations) {
    handleClientOperation(operation);
  }

  notify();
}

init();
