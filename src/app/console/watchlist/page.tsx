import type { Metadata } from "next";

import { PageHeader } from "@/components/console/page-header";
import { WatchlistLive } from "@/components/console/watchlist-live";

export const metadata: Metadata = {
  title: "Watchlist",
  description: "Subjects re-checked on a schedule, with what changed.",
};

export default function WatchlistPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Watchlist"
        description="A single analysis is a photograph. Most of what this platform checks only becomes false at some point in time — usually after someone has already bought — so these subjects are re-checked on a schedule and the differences reported."
      />
      <WatchlistLive />
    </div>
  );
}
