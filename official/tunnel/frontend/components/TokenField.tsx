import { Fragment, h, ui, useT } from "../kubek";
import type { TunnelForm } from "../lib/useTunnelForm";
import type { Draft } from "../types";
import { Field, TextInput } from "./Field";

interface TokenFieldProps {
  form: TunnelForm;
  label: string;
  name: "pinggyToken" | "frpToken";
  clear: "clearPinggyToken" | "clearFrpToken";
  saved: boolean;
  hint?: string;
}

/** Secret input, a saved token is never shown and stays unless replaced or removed */
export function TokenField({ form, label, name, clear, saved, hint }: TokenFieldProps) {
  const t = useT();
  const kept = saved && !form.draft[clear];
  return (
    <Fragment>
      <Field label={label} hint={kept ? t("ext.tunnel.tokenSet") : hint} error={form.fieldErrors[name]}>
        <TextInput form={form} name={name} type="password" autoComplete="off" />
      </Field>
      {kept && (
        <ui.Button
          type="button"
          variant="link"
          size="sm"
          className="justify-self-start"
          onClick={() => form.set({ [clear]: true } as Partial<Draft>)}
        >
          {t("ext.tunnel.clearToken")}
        </ui.Button>
      )}
    </Fragment>
  );
}
