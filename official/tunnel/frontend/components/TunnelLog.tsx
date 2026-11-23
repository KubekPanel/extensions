import { h, useT } from "../kubek";

const SHOWN_LINES = 15;

export function TunnelLog({ lines }: { lines: string[] }) {
  const t = useT();
  if (!lines.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">{t("ext.tunnel.log")}</summary>
      <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {lines.slice(-SHOWN_LINES).join("\n")}
      </pre>
    </details>
  );
}
