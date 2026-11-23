import { h, ui, useMask, useT } from "../kubek";

export function AddressRow({ label, value }: { label: string; value: string }) {
  const t = useT();
  const mask = useMask();
  return (
    <div className="grid gap-1">
      <span className="label-caps">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm">{mask ? mask.text(value) : value}</code>
        <ui.CopyButton value={value} title={t("ext.tunnel.copy")} />
      </div>
    </div>
  );
}
