/**
 * The home tab is kept alive by the app shell (src/components/AppShell.tsx), so switching tabs never
 * re-mounts it; the route itself renders nothing of its own.
 */
export default function Page() {
  return null;
}
