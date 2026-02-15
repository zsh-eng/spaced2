import EditFlashcardFooterActions from "@/components/card-actions/edit-flashcard-footer-actions";
import { type EditFlashcardActions } from "@/components/card-actions/edit-flashcard-responsive";
import { CreateUpdateFlashcardForm } from "@/components/create-flashcard";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { CardContentFormValues } from "@/lib/form-schema";
import { CardWithMetadata } from "@/lib/types";

type EditFlashcardDrawerProps = {
  onEdit: (values: CardContentFormValues) => void;
  card: CardWithMetadata;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: EditFlashcardActions;
};

export default function EditFlashcardDrawer({
  card,
  open,
  onOpenChange,
  onEdit,
  actions,
}: EditFlashcardDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full">
        <DrawerHeader>
          <DrawerTitle>Edit Flashcard</DrawerTitle>
        </DrawerHeader>

        <CreateUpdateFlashcardForm
          onSubmit={onEdit}
          initialFront={card.front}
          initialBack={card.back}
        />

        {actions && (
          <EditFlashcardFooterActions
            actions={actions}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
