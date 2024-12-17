import { Button } from '@/components/ui/button';
import { Form, FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  cardContentFormSchema,
  CardContentFormValues,
} from '@/lib/form-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

type CreateFlashcardFormProps = {
  onSubmit: (values: CardContentFormValues) => void;
};

export function CreateFlashcardForm({ onSubmit }: CreateFlashcardFormProps) {
  const form = useForm<CardContentFormValues>({
    resolver: zodResolver(cardContentFormSchema),
    defaultValues: {
      question: '',
      answer: '',
    },
  });

  const handleSubmit = (data: CardContentFormValues) => {
    onSubmit(data);
    form.reset();
    form.setFocus('question');
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className='flex flex-col gap-4'
      >
        <FormField
          control={form.control}
          name='question'
          render={({ field }) => <Input {...field} />}
        />

        <FormField
          control={form.control}
          name='answer'
          render={({ field }) => <Input {...field} />}
        />

        <Button type='submit'>Create</Button>
      </form>
    </Form>
  );
}