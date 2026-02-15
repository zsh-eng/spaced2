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
} from "@/lib/review/actions";
import { updateCardContentOperation } from "@/lib/sync/operation";
import { CardWithMetadata } from "@/lib/types";
import { useState } from "react";

const FlashcardTable = ({ cards }: { cards: CardWithMetadata[] }) => {
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
            onBookmark: (bookmarked) => handleCardSave(bookmarked, selectedCard),
            onDelete: () => {
              handleCardDelete(selectedCard);
              setOpen(false);
            },
            onBury: () => {
              handleCardBury(selectedCard);
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
                colSpan={3}
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
