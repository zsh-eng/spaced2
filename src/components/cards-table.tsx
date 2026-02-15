import EditFlashcardResponsive from "@/components/card-actions/edit-flashcard-responsive";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CardContentFormValues } from "@/lib/form-schema";
import {
  handleCardBury,
  handleCardDelete,
  handleCardSave,
  handleCardUnsuspend,
} from "@/lib/review/actions";
import { updateCardContentOperation } from "@/lib/sync/operation";
import { CardWithMetadata } from "@/lib/types";
import { isCardPermanentlySuspended } from "@/lib/utils";
import { format } from "date-fns";
import { useState } from "react";

function formatSuspendedUntil(suspended?: Date) {
  if (!suspended || suspended <= new Date()) return null;
  if (isCardPermanentlySuspended(suspended)) return "Indefinitely";
  return format(suspended, "MMM d, yyyy h:mm a");
}

type FlashcardTableProps = {
  cards: CardWithMetadata[];
  showSuspendedColumn?: boolean;
};

const FlashcardTable = ({
  cards,
  showSuspendedColumn,
}: FlashcardTableProps) => {
  const [selectedCard, setSelectedCard] = useState<CardWithMetadata | null>(
    null,
  );
  const [open, setOpen] = useState(false);

  const handleEdit = (values: CardContentFormValues) => {
    if (!selectedCard) {
      return;
    }
    const hasChanged =
      selectedCard.front !== values.front || selectedCard.back !== values.back;
    if (hasChanged) {
      updateCardContentOperation(selectedCard.id, values.front, values.back);
    }
    setSelectedCard(null);
    setOpen(false);
  };

  const columnCount = showSuspendedColumn ? 4 : 3;

  return (
    <div className="rounded-md border animate-fade-in">
      {selectedCard && (
        <EditFlashcardResponsive
          card={selectedCard}
          onEdit={handleEdit}
          open={open}
          onOpenChange={setOpen}
          actions={{
            bookmarked: selectedCard.bookmarked,
            onBookmark: (bookmarked) =>
              handleCardSave(bookmarked, selectedCard),
            onDelete: () => {
              handleCardDelete(selectedCard);
              setOpen(false);
            },
            onBury: () => {
              handleCardBury(selectedCard);
              setOpen(false);
            },
            suspended: selectedCard.suspended,
            onUnsuspend: () => {
              handleCardUnsuspend(selectedCard);
              setOpen(false);
            },
          }}
        />
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">Question</TableHead>
            <TableHead className="w-48">Answer</TableHead>
            {showSuspendedColumn && (
              <TableHead className="w-36">Suspended until</TableHead>
            )}
            <TableHead className="w-32">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cards.map((card) => (
            <TableRow
              key={card.id}
              onClick={() => {
                setSelectedCard(card);
                setOpen(true);
              }}
            >
              <TableCell className="font-medium">{card.front}</TableCell>
              <TableCell>{card.back}</TableCell>
              {showSuspendedColumn && (
                <TableCell className="text-muted-foreground">
                  {formatSuspendedUntil(card.suspended)}
                </TableCell>
              )}
              <TableCell>
                {new Date(card.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {cards.length === 0 && (
          <TableFooter>
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="text-muted-foreground text-center h-16"
              >
                No cards found
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
};

export default FlashcardTable;
