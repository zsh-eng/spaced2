import LoginScreen from '@/components/login.tsx';
import SyncEngine from '@/lib/sync/engine.ts';
import DeckRoute from '@/routes/DeckRoute.tsx';
import DecksRoute from '@/routes/DecksRoute.tsx';
import MeRoute from '@/routes/Me.tsx';
import OpsRoute from '@/routes/Ops.tsx';
import ReviewRoute from '@/routes/Review.tsx';
import SyncRoute from '@/routes/Sync.tsx';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import App from './App.tsx';
import './index.css';

SyncEngine.start();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<App />} />
        <Route path='/review' element={<ReviewRoute />} />
        <Route path='/ops' element={<OpsRoute />} />
        <Route path='/login' element={<LoginScreen />} />
        <Route path='/me' element={<MeRoute />} />
        <Route path='/sync' element={<SyncRoute />} />
        <Route path='/decks' element={<DecksRoute />} />
        <Route path='/decks/:deckId' element={<DeckRoute />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
