import { Fragment, h, icons, React, ui, useMask, useT } from "../kubek";
import { useTunnel } from "../lib/api";
import { errorText } from "../lib/errors";
import type { Status } from "../types";
import { TunnelDialog } from "./TunnelDialog";

const TONE: Record<Status, string> = {
  off: "gray",
  waiting: "gray",
  starting: "amber",
  online: "green",
  error: "red",
};

/** Card in the column next to the console, opens the settings on click */
export function TunnelCard({ context }: { context?: { serverId?: string } }) {
  const t = useT();
  const mask = useMask();
  const serverId = context?.serverId;
  const [open, setOpen] = React.useState(false) as [boolean, (next: boolean) => void];
  const tunnel = useTunnel(serverId, open);

  // No permission or no extension routes, the card is not for this user
  if (!serverId || tunnel.isError || !tunnel.data) return null;
  const { config, state } = tunnel.data;
  const address = state.status === "off" ? undefined : state.address;
  const title = t("ext.tunnel.button");
  const label = config.enabled ? `${title} · ${t(`ext.tunnel.provider.${config.provider}`)}` : title;
  const value = address ? (
    <span className="font-mono text-[13px]">{mask ? mask.text(address) : address}</span>
  ) : state.status === "error" && state.error ? (
    errorText(t, state.error)
  ) : (
    t(`ext.tunnel.status.${state.status}`)
  );

  const onKeyDown = (ev: { key: string; preventDefault: () => void }) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    setOpen(true);
  };

  return (
    <Fragment>
      <ui.InfoCard
        icon={icons.Globe}
        tone={TONE[state.status]}
        label={label}
        value={value}
        role="button"
        tabIndex={0}
        title={t("ext.tunnel.title")}
        className="cursor-pointer transition-colors outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary/70"
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        action={
          address ? (
            <ui.CopyButton value={address} title={t("ext.tunnel.copy")} />
          ) : (
            <icons.ChevronRight className="size-4 text-muted-foreground" />
          )
        }
      />
      {open && <TunnelDialog serverId={serverId} view={tunnel.data} onClose={() => setOpen(false)} />}
    </Fragment>
  );
}
