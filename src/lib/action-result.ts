/** Shape returned by server actions consumed with useActionState. */
export type FormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const GENERIC_ERROR = "Something went wrong. Please try again.";
