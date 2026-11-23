import { h, ui, useT } from "../kubek";
import type { TunnelForm } from "../lib/useTunnelForm";
import { StatusDot } from "./StatusDot";

export function StatusSwitch({ form }: { form: TunnelForm }) {
  const t = useT();
  const { status } = form.view.state;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <div className="grid gap-0.5">
        <span className="text-sm font-medium">{t("ext.tunnel.enable")}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot status={status} />
          {t(`ext.tunnel.status.${status}`)}
        </span>
      </div>
      <ui.Switch checked={form.draft.enabled} disabled={form.saving} onCheckedChange={form.toggle} />
    </div>
  );
}
