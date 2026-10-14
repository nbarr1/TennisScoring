/**
 * Next.js remounts a template on every navigation, so the `page-enter` class
 * replays its short fade on each page. The animation lives in globals.css.
 */
export default function Template({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="page-enter">{children}</div>;
}
