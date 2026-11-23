import { h, ui } from "../kubek";
import type { Draft } from "../types";
import type { TunnelForm } from "../lib/useTunnelForm";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: unknown;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <ui.Label>{label}</ui.Label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

interface TextInputProps {
  form: TunnelForm;
  name: keyof Draft;
  [prop: string]: unknown;
}

/** Input bound to one draft field, red when the backend rejected it */
export function TextInput({ form, name, ...props }: TextInputProps) {
  return (
    <ui.Input
      value={form.draft[name] as string}
      onChange={(ev: { target: { value: string } }) => form.set({ [name]: ev.target.value })}
      aria-invalid={form.fieldErrors[name] ? true : undefined}
      {...props}
    />
  );
}
