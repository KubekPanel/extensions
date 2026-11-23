/** Known error keys get translated, anything else is a raw message from the backend */
export function errorText(t: (key: string) => string, error: string): string {
  const key = `ext.tunnel.error.${error}`;
  const value = t(key);
  return value === key || value.startsWith("NOT TRANSLATED") ? error : value;
}
