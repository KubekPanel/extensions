import { h, useT } from "../kubek";
import type { TunnelForm } from "../lib/useTunnelForm";
import { PROVIDERS } from "../types";
import { FrpFields } from "./providers/FrpFields";
import { MinekubeFields } from "./providers/MinekubeFields";
import { PinggyFields } from "./providers/PinggyFields";

const FIELDS = { minekube: MinekubeFields, pinggy: PinggyFields, frp: FrpFields };

export function ProviderPicker({ form }: { form: TunnelForm }) {
  const t = useT();
  const Fields = FIELDS[form.draft.provider];
  return (
    <div className="grid gap-4">
      <div className="grid gap-2" role="radiogroup">
        {PROVIDERS.map((id) => {
          const active = form.draft.provider === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => form.set({ provider: id })}
              className={`grid gap-0.5 rounded-lg border px-4 py-2.5 text-left transition-colors ${
                active ? "border-primary bg-primary/8" : "border-border hover:bg-muted/50"
              }`}
            >
              <span className="text-sm font-medium">{t(`ext.tunnel.provider.${id}`)}</span>
              <span className="text-xs text-muted-foreground">{t(`ext.tunnel.provider.${id}.hint`)}</span>
            </button>
          );
        })}
      </div>
      <Fields form={form} />
    </div>
  );
}
