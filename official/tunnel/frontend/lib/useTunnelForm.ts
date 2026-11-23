import { http, query, React, useT } from "../kubek";
import type { Draft, FieldErrors, TunnelView } from "../types";
import { tunnelKey, tunnelPath } from "./api";
import { FIELD_INPUT, toBody, toDraft } from "./draft";
import { errorText } from "./errors";

export type TunnelForm = ReturnType<typeof useTunnelForm>;

export function useTunnelForm(serverId: string, view: TunnelView) {
  const t = useT();
  const qc = query.useQueryClient();
  const [draft, setDraft] = React.useState(() => toDraft(view)) as [Draft, (next: Draft | ((d: Draft) => Draft)) => void];
  const [fieldErrors, setFieldErrors] = React.useState({}) as [FieldErrors, (next: FieldErrors) => void];
  const [saveError, setSaveError] = React.useState(null) as [string | null, (next: string | null) => void];

  const clearErrors = () => {
    setFieldErrors({});
    setSaveError(null);
  };

  const save = query.useMutation<Draft>({
    mutationFn: (next) => http.post(tunnelPath(serverId), toBody(next)),
    meta: { silent: true },
    onSuccess: () => {
      clearErrors();
      qc.invalidateQueries({ queryKey: tunnelKey(serverId) });
    },
    onError: (error) => {
      // A failed save leaves the tunnel as it was, the switch goes back too
      setDraft((d) => ({ ...d, enabled: view.config.enabled }));
      const fields = (error as { body?: { fields?: string[] } }).body?.fields ?? [];
      const errors: FieldErrors = {};
      let general: string | null = fields.length ? null : t("ext.tunnel.error.saveFailed");
      for (const field of fields) {
        const input = FIELD_INPUT[field];
        if (input) errors[input] = errorText(t, `invalid.${field}`);
        else general = errorText(t, `invalid.${field}`);
      }
      setFieldErrors(errors);
      setSaveError(general);
    },
  });

  const set = (patch: Partial<Draft>) => {
    clearErrors();
    setDraft((d) => ({ ...d, ...patch }));
  };

  const toggle = (enabled: boolean) => {
    const next = { ...draft, enabled };
    setDraft(next);
    save.mutate(next);
  };

  return {
    view,
    draft,
    set,
    toggle,
    fieldErrors,
    saveError,
    saving: save.isPending,
    submit: () => save.mutate(draft),
  };
}
