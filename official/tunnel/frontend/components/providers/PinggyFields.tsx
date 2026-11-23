import { Fragment, h, useT } from "../../kubek";
import type { TunnelForm } from "../../lib/useTunnelForm";
import { TokenField } from "../TokenField";

export function PinggyFields({ form }: { form: TunnelForm }) {
  const t = useT();
  return (
    <Fragment>
      <TokenField
        form={form}
        label={t("ext.tunnel.pinggy.token")}
        name="pinggyToken"
        clear="clearPinggyToken"
        saved={form.view.config.pinggy.tokenSet}
        hint={t("ext.tunnel.pinggy.tokenHint")}
      />
      <p className="text-xs text-muted-foreground">{t("ext.tunnel.pinggy.note")}</p>
    </Fragment>
  );
}
