import { Fragment, h, useT } from "../../kubek";
import type { TunnelForm } from "../../lib/useTunnelForm";
import { Field, TextInput } from "../Field";
import { TokenField } from "../TokenField";

export function FrpFields({ form }: { form: TunnelForm }) {
  const t = useT();
  const errors = form.fieldErrors;
  return (
    <Fragment>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field label={t("ext.tunnel.frp.serverAddr")} error={errors.serverAddr}>
          <TextInput form={form} name="serverAddr" placeholder="vps.example.com" />
        </Field>
        <Field label={t("ext.tunnel.frp.serverPort")} error={errors.serverPort}>
          <TextInput form={form} name="serverPort" inputMode="numeric" />
        </Field>
      </div>
      <TokenField
        form={form}
        label={t("ext.tunnel.frp.token")}
        name="frpToken"
        clear="clearFrpToken"
        saved={form.view.config.frp.tokenSet}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("ext.tunnel.frp.remotePort")} error={errors.remotePort}>
          <TextInput form={form} name="remotePort" inputMode="numeric" />
        </Field>
        <Field label={t("ext.tunnel.frp.remoteUdpPort")} hint={t("ext.tunnel.frp.remoteUdpPortHint")} error={errors.remoteUdpPort}>
          <TextInput form={form} name="remoteUdpPort" inputMode="numeric" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">{t("ext.tunnel.frp.note")}</p>
    </Fragment>
  );
}
