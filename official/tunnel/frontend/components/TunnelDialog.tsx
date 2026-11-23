import { h, icons, ui, useT } from "../kubek";
import { errorText } from "../lib/errors";
import { useTunnelForm } from "../lib/useTunnelForm";
import type { TunnelView } from "../types";
import { AddressRow } from "./AddressRow";
import { ProviderPicker } from "./ProviderPicker";
import { StatusSwitch } from "./StatusSwitch";
import { TunnelLog } from "./TunnelLog";

interface TunnelDialogProps {
  serverId: string;
  view: TunnelView;
  onClose: () => void;
}

export function TunnelDialog({ serverId, view, onClose }: TunnelDialogProps) {
  const t = useT();
  const form = useTunnelForm(serverId, view);
  const { state } = view;
  const live = state.status !== "off";
  const minutesLeft = state.expiresAt ? Math.max(0, Math.round((state.expiresAt - Date.now()) / 60_000)) : null;
  const error = form.saveError ?? (state.error ? errorText(t, state.error) : null);

  return (
    <ui.Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <ui.DialogContent className="sm:max-w-[560px]">
        <ui.DialogHeader>
          <ui.DialogTitle>{t("ext.tunnel.title")}</ui.DialogTitle>
          <ui.DialogDescription>{t("ext.tunnel.subtitle")}</ui.DialogDescription>
        </ui.DialogHeader>
        <ui.DialogBody className="grid gap-4">
          <StatusSwitch form={form} />
          {live && state.address && <AddressRow label={t("ext.tunnel.address")} value={state.address} />}
          {live && state.bedrockAddress && <AddressRow label={t("ext.tunnel.bedrockAddress")} value={state.bedrockAddress} />}
          {minutesLeft !== null && (
            <p className="text-xs text-muted-foreground">{t("ext.tunnel.expires").replace("{min}", String(minutesLeft))}</p>
          )}
          {error && (
            <ui.Alert variant="destructive">
              <icons.CircleAlert />
              <ui.AlertDescription>{error}</ui.AlertDescription>
            </ui.Alert>
          )}
          <ui.Separator />
          <ProviderPicker form={form} />
          <TunnelLog lines={state.log} />
        </ui.DialogBody>
        <ui.DialogFooter>
          <ui.Button type="button" disabled={form.saving} onClick={form.submit}>
            {t("ext.tunnel.save")}
          </ui.Button>
        </ui.DialogFooter>
      </ui.DialogContent>
    </ui.Dialog>
  );
}
