import DeckCard from "@/components/deck/deck-card";
import { useCards } from "@/components/hooks/query";

export default function SuspendedDecksCardContainer() {
  const cards = useCards();
  const suspendedCards = cards.filter(
    (card) => card.suspended && card.suspended > new Date(),
  );

  if (suspendedCards.length === 0) return null;

  return (
    <DeckCard
      id="_suspended"
      name="Suspended Cards"
      description=""
      lastModified={new Date()}
      cardCount={suspendedCards.length}
    />
  );
}
