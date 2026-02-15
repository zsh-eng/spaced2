import { type EditFlashcardActions } from "@/components/card-actions/edit-flashcard-responsive";
import { cn } from "@/lib/utils";
import { Ban, BookmarkIcon, Eye, Trash } from "lucide-react";

type EditFlashcardFooterActionsProps = {
  actions: EditFlashcardActions;
  onClose: () => void;
};

export default function EditFlashcardFooterActions({
  actions,
  onClose,
}: EditFlashcardFooterActionsProps) {
  const handleAction = (fn: () => void) => {
    fn();
    onClose();
  };

  const isSuspended =
    actions.suspended && actions.suspended > new Date();

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-t border-border/50">
      <button
        type="button"
        onClick={() =>
          handleAction(() => actions.onBookmark(!actions.bookmarked))
        }
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all active:scale-95",
          actions.bookmarked
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <BookmarkIcon
          className="size-4"
          fill={actions.bookmarked ? "currentColor" : "none"}
        />
        {actions.bookmarked ? "Saved" : "Save"}
      </button>

      {isSuspended && actions.onUnsuspend ? (
        <button
          type="button"
          onClick={() => handleAction(actions.onUnsuspend!)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-all active:scale-95"
        >
          <Eye className="size-4" />
          Unsuspend
        </button>
      ) : (
        <button
          type="button"
          onClick={() => handleAction(actions.onBury)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-95"
        >
          <Ban className="size-4" />
          Bury
        </button>
      )}

      <div className="ml-auto">
        <button
          type="button"
          onClick={() => handleAction(actions.onDelete)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all active:scale-95"
        >
          <Trash className="size-4" />
          Delete
        </button>
      </div>
    </div>
  );
}
