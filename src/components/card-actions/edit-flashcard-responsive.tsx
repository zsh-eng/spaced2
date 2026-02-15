import EditFlashcardDialog from "@/components/card-actions/edit-flashcard-dialog";
import EditFlashcardDrawer from "@/components/card-actions/edit-flashcard-drawer";
import { CardContentFormValues } from "@/lib/form-schema";
import { CardWithMetadata } from "@/lib/types";
import { useMediaQuery } from "@uidotdev/usehooks";

export type EditFlashcardActions = {
  bookmarked: boolean;
  onBookmark: (bookmarked: boolean) => void;
  onDelete: () => void;
  onBury: () => void;
};

type EditFlashcardResponsiveProps = {
  card: CardWithMetadata;
  onEdit: (values: CardContentFormValues) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: EditFlashcardActions;
};

export default function EditFlashcardResponsive({
  card,
  onEdit,
  open,
  onOpenChange,
  actions,
}: EditFlashcardResponsiveProps) {
  const isMobile = useMediaQuery("(max-width: 640px)");

  return isMobile ? (
    <EditFlashcardDrawer
      card={card}
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      actions={actions}
    />
  ) : (
    <EditFlashcardDialog
      card={card}
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      actions={actions}
    />
  );
}
