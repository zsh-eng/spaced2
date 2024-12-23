import CardCountBadges from '@/components/card-count-badges';
import CurrentCardBadge from '@/components/current-card-badge';
import FlashcardContent from '@/components/flashcard-content';
import GradeButtons from '@/components/rating-buttons';
import { db } from '@/lib/db';
import { useFlashcardReviewQuery } from '@/lib/query';
import { gradeCard } from '@/lib/review';
import { Fragment } from 'react/jsx-runtime';
import { Grade } from 'ts-fsrs';

export default function ReviewRoute() {
  const reviewCards = useFlashcardReviewQuery();
  const nextReviewCard = reviewCards?.[0];

  function handleGrade(grade: Grade) {
    if (!nextReviewCard) return;

    const { nextCard } = gradeCard(nextReviewCard, grade);
    db.cards.update(nextCard.id, {
      ...nextCard,
      due: nextCard.due,
    });
  }

  return (
    <div className='max-w-4xl h-full flex gap-2 flex-col items-center mx-auto mt-20'>
      <div className='w-full flex justify-between'>
        <div className='flex gap-2'>
          <CardCountBadges />
          {nextReviewCard && <CurrentCardBadge card={nextReviewCard} />}
        </div>
        <div>action buttons</div>
      </div>

      <div className='flex justify-center items-center gap-2 mb-6 w-full'>
        {nextReviewCard ? (
          <Fragment>
            <FlashcardContent content={nextReviewCard.question} />
            <hr className='my-4' />
            <FlashcardContent content={nextReviewCard.answer} />
          </Fragment>
        ) : (
          <div>No cards to review</div>
        )}
      </div>

      {nextReviewCard && (
        <GradeButtons onGrade={handleGrade} card={nextReviewCard} />
      )}
    </div>
  );
}
