import { FormTextareaImageUpload } from "@/components/form/form-textarea-image-upload";
import CmdEnterIcon from "@/components/keyboard/CmdEnterIcon";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  cardContentFormSchema,
  CardContentFormValues,
} from "@/lib/form-schema";
import { isEventTargetInput } from "@/lib/utils";
import VibrationPattern from "@/lib/vibrate";
import { zodResolver } from "@hookform/resolvers/zod";
import { Book } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type CreateUpdateFlashcardFormProps = {
  onSubmit: (values: CardContentFormValues) => void;
  numDecks?: number;
  initialFront?: string;
  initialBack?: string;
  onImageUpload?: (image: File) => Promise<void>;
};

const FOCUS_QUESTION_KEY = " ";
const LOCALSTORAGE_KEY = "create-flashcard-draft";

const saveDraft = (values: CardContentFormValues) => {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(values));
  } catch (e) {
    console.error("Failed to save draft:", e);
  }
};

const loadDraft = (): CardContentFormValues | null => {
  try {
    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.error("Failed to load draft:", e);
    return null;
  }
};

const clearDraft = () => {
  try {
    localStorage.removeItem(LOCALSTORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear draft:", e);
  }
};

export function CreateUpdateFlashcardForm({
  onSubmit,
  numDecks,
  initialFront,
  initialBack,
  onImageUpload,
}: CreateUpdateFlashcardFormProps) {
  const isUpdateMode = Boolean(
    initialFront !== undefined || initialBack !== undefined,
  );

  const defaultValues = useMemo(() => {
    if (isUpdateMode) {
      return {
        front: initialFront || "",
        back: initialBack || "",
      };
    }

    const draft = loadDraft();
    return {
      front: draft?.front || "",
      back: draft?.back || "",
    };
  }, [isUpdateMode, initialFront, initialBack]);

  const form = useForm<CardContentFormValues>({
    resolver: zodResolver(cardContentFormSchema),
    defaultValues,
  });

  useEffect(() => {
    if (isUpdateMode) return;

    const subscription = form.watch((values) => {
      saveDraft(values as CardContentFormValues);
    });

    return () => subscription.unsubscribe();
  }, [form, isUpdateMode]);

  const handleSubmit = useCallback(
    (data: CardContentFormValues) => {
      navigator?.vibrate?.(VibrationPattern.successConfirm);

      onSubmit(data);
      // Explicitly reset to empty instead of the default values (because they were fetched from localStorage)
      form.reset({ front: "", back: "" });
      // TODO: fix the focus not returning to the front input
      form.setFocus("front");

      if (isUpdateMode) {
        const hasChanged =
          initialFront !== data.front || initialBack !== data.back;
        if (hasChanged) {
          toast.success("Flashcard updated");
        }
      } else {
        clearDraft();
        toast.success("Flashcard created");
      }
    },
    [form, isUpdateMode, initialFront, initialBack, onSubmit],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isEventTargetInput(event) && event.key === FOCUS_QUESTION_KEY) {
        form.setFocus("front");
        event.preventDefault();
        return;
      }

      if (isEventTargetInput(event) && event.metaKey && event.key === "Enter") {
        form.handleSubmit(handleSubmit)();
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [form, handleSubmit]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-4 bg-background rounded-xl p-4 h-full justify-center"
      >
        <div className="grow">
          <FormTextareaImageUpload
            onUploadImage={onImageUpload}
            className="text-sm border-none shadow-none h-32"
            form={form}
            name="front"
            placeholder="Enter the question"
          />
        </div>

        <div className="grow">
          <FormTextareaImageUpload
            onUploadImage={onImageUpload}
            className="text-sm border-none shadow-none h-32"
            form={form}
            name="back"
            placeholder="Enter the answer"
          />
        </div>

        <div className="flex justify-start">
          {numDecks !== undefined && (
            <div className="flex gap-1 text-muted-foreground justify-center items-center font-semibold ml-2">
              <Book className="w-5 h-5" />
              <span className="text-sm">
                {numDecks} {numDecks === 1 ? "deck" : "decks"} selected
              </span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="ml-auto self-end rounded-lg [&_svg]:size-3"
          >
            {isUpdateMode ? "Update" : "Create"}
            <CmdEnterIcon />
          </Button>
        </div>
      </form>
    </Form>
  );
}
