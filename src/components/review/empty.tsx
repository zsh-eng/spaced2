import BouncyButton from '@/components/bouncy-button';
import { CopyPlus } from 'lucide-react';
import { Link } from 'react-router';

export default function EmptyReviewUi() {
  return (
    <div className='relative w-full max-w-lg mx-auto'>
      {/* Blur backdrop */}
      <div className='absolute inset-0 backdrop-blur-lg bg-muted/20 rounded-lg' />

      {/* Content that sits on top of blur */}
      <div className='relative p-6 space-y-2 flex flex-col items-center justify-center'>
        <Link to='/create' className='mb-6'>
          <BouncyButton>
            <CopyPlus className='h-16 w-16 text-primary cursor-pointer' />
          </BouncyButton>
        </Link>
        <h2 className='text-xl font-bold text-foreground w-full text-center'>
          Great job! <br />
          You're done for now!
        </h2>
        <p className='text-muted-foreground text-center w-60 text-sm'>
          Come back later or create some new cards by clicking the button above.
        </p>
      </div>
    </div>
  );
}
