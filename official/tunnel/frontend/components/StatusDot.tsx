import { h } from "../kubek";
import type { Status } from "../types";

const DOT: Record<Status, string> = {
  off: "bg-muted-foreground/40",
  waiting: "bg-muted-foreground",
  starting: "bg-warning animate-pulse",
  online: "bg-success",
  error: "bg-danger",
};

export const StatusDot = ({ status }: { status: Status }) => <span className={`size-1.5 rounded-full ${DOT[status]}`} />;
