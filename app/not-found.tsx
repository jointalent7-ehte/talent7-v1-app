import Link from "next/link";

export default function NotFound() {
  return (
    <main className="routeStatePage">
      <div className="routeStateMark" aria-hidden="true">7</div>
      <p className="eyebrow">Page not found</p>
      <h1>This Talent7 link is unavailable</h1>
      <p>The page may have moved, or the shared link may be incomplete.</p>
      <div className="routeStateActions">
        <Link href="/#rooms">Browse challenge rooms</Link>
        <Link className="secondary" href="/support">Get support</Link>
      </div>
    </main>
  );
}
