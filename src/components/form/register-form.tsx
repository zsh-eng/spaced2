import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { registerFormSchema } from "@/lib/form-schema";
import VibrationPattern from "@/lib/vibrate";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type RegisterFormValues = z.infer<typeof registerFormSchema>;

type RegisterFormProps = {
  onSubmit: (data: RegisterFormValues) => Promise<void>;
};

export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const handleSubmit = async (data: RegisterFormValues) => {
    navigator?.vibrate?.(VibrationPattern.successConfirm);
    await onSubmit(data);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-4 py-4"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex flex-col items-start">
              <FormLabel className="text-foreground">Email</FormLabel>
              <FormControl>
                <div className="relative items-center gap-2 w-full">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input className="pl-10 text-sm" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem className="flex flex-col items-start">
              <FormLabel className="text-foreground">Password</FormLabel>
              <FormControl>
                <div className="relative items-center gap-2 w-full">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input className="pl-10 text-sm" type="password" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem className="flex flex-col items-start">
              <FormLabel className="text-foreground">
                Confirm Password
              </FormLabel>
              <FormControl>
                <div className="relative items-center gap-2 w-full">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input className="pl-10 text-sm" type="password" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full active:scale-95 transition-all duration-100 ease-out mt-4"
          size={"lg"}
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Sign up"
          )}
        </Button>
      </form>
    </Form>
  );
}
