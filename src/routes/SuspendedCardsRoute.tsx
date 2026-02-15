import CardsTable from "@/components/cards-table";
import { useCards } from "@/components/hooks/query";
import ReturnToTop from "@/components/return-to-top";
import SearchBar from "@/components/search-bar";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

export default function SuspendedCardsRoute() {
  const cards = useCards();
  const [search, setSearch] = useState("");

  const suspendedCards = cards.filter(
    (card) => card.suspended && card.suspended > new Date(),
  );
  const filteredCards = suspendedCards.filter((card) =>
    (card.front.toLowerCase() + card.back.toLowerCase()).includes(
      search.toLowerCase(),
    ),
  );

  return (
    <div className="md:px-24 xl:px-0 col-span-12 xl:col-start-3 xl:col-end-11">
      <ReturnToTop />
      <SearchBar
        search={search}
        setSearch={setSearch}
        placeholder="Search suspended cards..."
      />
      <div className="mb-4 px-2">
        <h1 className="text-2xl md:text-4xl font-bold tracking-wide">
          Suspended Cards
        </h1>
      </div>
      <Separator className="my-4" />
      <CardsTable cards={filteredCards} showSuspendedColumn />
    </div>
  );
}
