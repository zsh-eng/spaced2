import SessionExpiredBanner from '@/components/session-expired-banner';
import NavBar from '@/components/nav/nav-bar.tsx';
import { SpacedIcon } from '@/components/nav/spaced-icon';
import { Toaster } from '@/components/ui/sonner.tsx';
import SyncEngine from '@/lib/sync/engine.ts';
import { cn } from '@/lib/utils.ts';
import AllCardsRoute from '@/routes/AllCardsRoute';
import BookmarksRoute from '@/routes/BookmarksRoute.tsx';
import CreateFlashcardRoute from '@/routes/CreateFlashcardRoute.tsx';
import DeckRoute from '@/routes/DeckRoute.tsx';
import DecksRoute from '@/routes/DecksRoute.tsx';
import ProfileRoute from '@/routes/ProfileRoute';
import ReviewRoute from '@/routes/Review.tsx';
import StatsRoute from '@/routes/StatsRoute';
import DebugRoute from '@/routes/Sync.tsx';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './index.css';

SyncEngine.start();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <div
        className={cn(
          'grid grid-cols-12 gap-x-6 items-start',
          'px-2 md:px-0 pb-12 pt-20 md:pt-8',
          'min-h-screen grid-rows-[min-content_1fr] bg-background font-sans antialiased',
          'bg-muted'
        )}
      >
        <SpacedIcon />
        <NavBar />
        <SessionExpiredBanner />
        <Toaster
          position='top-center'
          icons={{
            success: <CircleCheck className='text-primary size-5' />,
            error: <CircleAlert className='text-destructive size-5' />,
          }}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                'bg-background rounded-xl w-80 py-4 pl-5 pr-4 shadow-sm flex gap-2 items-center',
              title: 'text-sm',
              description: 'text-xs',
              icon: 'size-4',
              actionButton:
                'text-xs font-semibold px-3 py-2 bg-primary text-primary-foreground rounded-md cursor-pointer active:scale-95 transition-all',
            },
          }}
        />
        <Routes>
          <Route path='/' element={<ReviewRoute />} />
          <Route path='/decks' element={<DecksRoute />} />
          <Route path='/decks/_all' element={<AllCardsRoute />} />
          <Route path='/decks/:deckId' element={<DeckRoute />} />
          <Route path='/bookmarks' element={<BookmarksRoute />} />
          <Route path='/debug' element={<DebugRoute />} />
          <Route path='/create' element={<CreateFlashcardRoute />} />
          <Route path='/profile' element={<ProfileRoute />} />
          <Route path='/stats' element={<StatsRoute />} />
        </Routes>
      </div>
    </BrowserRouter>
  </StrictMode>
);
