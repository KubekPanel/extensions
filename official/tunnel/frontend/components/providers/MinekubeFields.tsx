import { Fragment, h, icons, ui, useT } from "../../kubek";
import type { TunnelForm } from "../../lib/useTunnelForm";
import { Field, TextInput } from "../Field";

export function MinekubeFields({ form }: { form: TunnelForm }) {
  const t = useT();
  return (
    <Fragment>
      <Field label={t("ext.tunnel.minekube.name")} hint={t("ext.tunnel.minekube.nameHint")} error={form.fieldErrors.name}>
        <div className="flex items-center gap-2">
          <TextInput form={form} name="name" placeholder="my-server" className="font-mono" />
          <span className="shrink-0 font-mono text-sm text-muted-foreground">.play.minekube.net</span>
        </div>
      </Field>
      <ui.Alert>
        <icons.TriangleAlert />
        <ui.AlertTitle>{t("ext.tunnel.minekube.warningTitle")}</ui.AlertTitle>
        <ui.AlertDescription>{t("ext.tunnel.minekube.warning")}</ui.AlertDescription>
      </ui.Alert>
    </Fragment>
  );
}
