import EditFlashcardResponsive from "@/components/card-actions/edit-flashcard-responsive";
import { useDecks, useReviewCards } from "@/components/hooks/query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { CardContentFormValues } from "@/lib/form-schema";
import {
  handleCardBury,
  handleCardDelete,
  handleCardEdit,
  handleCardSave,
  handleCardSuspend,
} from "@/lib/review/actions";
import { Deck } from "@/lib/types";
import {
  Ban,
  Book,
  Bookmark,
  BookmarkIcon,
  ChevronsRight,
  Home,
  Pencil,
  Plus,
  Trash,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

function NavPathCommandItem({
  path,
  icon,
  label,
  onSelect,
}: {
  path: string;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <CommandItem
      onSelect={() => {
        navigate(path);
        onSelect();
      }}
    >
      {icon}
      <span>{label}</span>
      {location.pathname === path && (
        <CommandShortcut className="uppercase tracking-wide font-semibold text-xs text-muted-foreground/50">
          Current
        </CommandShortcut>
      )}
    </CommandItem>
  );
}

type CommandBarActionsProps = {
  bookmarked: boolean;
  handleBookmark: (bookmarked: boolean) => void;
  handleDelete: () => void;
  handleSkip: () => void;
  handleBury: () => void;
  handleEdit: () => void;
};

function CommandBarActions({
  bookmarked,
  handleBookmark,
  handleDelete,
  handleSkip,
  handleBury,
  handleEdit,
}: CommandBarActionsProps) {
  return (
    <>
      <CommandItem onSelect={() => handleBookmark(!bookmarked)}>
        <BookmarkIcon className={bookmarked ? "text-primary" : ""} />
        <span>{bookmarked ? "Unsave" : "Save"}</span>
      </CommandItem>

      <CommandItem onSelect={handleSkip}>
        <ChevronsRight />
        <span>Skip</span>
      </CommandItem>

      <CommandItem onSelect={handleBury}>
        <Ban />
        <span>Bury</span>
      </CommandItem>

      <CommandItem onSelect={handleEdit}>
        <Pencil />
        <span>Edit</span>
      </CommandItem>

      <CommandItem onSelect={handleDelete}>
        <Trash />
        <span>Delete</span>
      </CommandItem>
    </>
  );
}

function CommandBarDecks({
  decks,
  onSelect,
}: {
  decks: Deck[];
  onSelect: (deckId: string) => void;
}) {
  return (
    <CommandGroup heading="Decks">
      {decks.map((deck) => (
        <CommandItem key={deck.id} onSelect={() => onSelect(deck.id)}>
          <Book className="h-4 w-4 text-primary" />
          {deck.name}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
export default function CommandBar() {
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { pathname } = useLocation();
  const isReviewPath = pathname === "/";

  const decks = useDecks();
  const navigate = useNavigate();
  const reviewCards = useReviewCards();
  const nextReviewCard = reviewCards?.[0];

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  function handleDeckSelect(deckId: string) {
    navigate(`/decks/${deckId}`);
    setOpen(false);
  }

  async function handleDelete() {
    await handleCardDelete(nextReviewCard);
    setOpen(false);
  }

  async function handleSuspend() {
    await handleCardSuspend(nextReviewCard);
    setOpen(false);
  }

  async function handleBury() {
    await handleCardBury(nextReviewCard);
    setOpen(false);
  }

  async function handleSave(bookmarked: boolean) {
    await handleCardSave(bookmarked, nextReviewCard);
    setOpen(false);
  }

  async function handleEdit(values: CardContentFormValues) {
    await handleCardEdit(values, nextReviewCard);
    setIsEditing(false);
  }

  return (
    <>
      {/* Cannot nest in the dialog, must be separate such that we can open and close individually */}
      {isReviewPath && nextReviewCard && (
        <EditFlashcardResponsive
          card={nextReviewCard}
          open={isEditing}
          onOpenChange={setIsEditing}
          onEdit={handleEdit}
          actions={{
            bookmarked: nextReviewCard.bookmarked,
            onBookmark: handleSave,
            onDelete: handleDelete,
            onBury: handleBury,
          }}
        />
      )}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {isReviewPath && nextReviewCard && (
            <CommandGroup heading="Actions">
              <CommandBarActions
                bookmarked={nextReviewCard.bookmarked}
                handleBookmark={handleSave}
                handleDelete={handleDelete}
                handleSkip={handleSuspend}
                handleBury={handleBury}
                handleEdit={async () => {
                  // Close command par before opening the edit dialog
                  setOpen(false);
                  setIsEditing(true);
                }}
              />
            </CommandGroup>
          )}

          <CommandGroup heading="Navigation">
            <NavPathCommandItem
              path="/"
              icon={<Home className="h-4 w-4" />}
              label="Home"
              onSelect={() => setOpen(false)}
            />
            <NavPathCommandItem
              path="/decks"
              icon={<Book className="h-4 w-4" />}
              label="Decks"
              onSelect={() => setOpen(false)}
            />
            <NavPathCommandItem
              path="/saved"
              icon={<Bookmark className="h-4 w-4" />}
              label="Saved"
              onSelect={() => setOpen(false)}
            />
            <NavPathCommandItem
              path="/create"
              icon={<Plus className="h-4 w-4" />}
              label="Create"
              onSelect={() => setOpen(false)}
            />
            <NavPathCommandItem
              path="/profile"
              icon={<UserRound className="h-4 w-4" />}
              label="Profile"
              onSelect={() => setOpen(false)}
            />
            <NavPathCommandItem
              path="/import"
              icon={<Upload className="h-4 w-4" />}
              label="Import"
              onSelect={() => setOpen(false)}
            />
          </CommandGroup>

          <CommandBarDecks decks={decks} onSelect={handleDeckSelect} />
        </CommandList>
      </CommandDialog>
    </>
  );
}
