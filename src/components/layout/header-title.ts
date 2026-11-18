/** Route prefix → `Header.<key>` title. Longest/most specific first wins by order. */
export const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/notifications": "notifications",
  "/contacts": "contacts",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/reactivation": "reactivation",
  "/automations": "automations",
  "/flows": "flows",
  "/settings": "settings",
};

export function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) => pathname.startsWith(path));
  return match ? match[1] : "dashboard";
}
