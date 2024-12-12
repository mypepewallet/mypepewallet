import { Route, Routes } from 'react-router-dom';

import { useAppContext } from '../hooks/useAppContext';
import { Password, ResetWallet } from '../views/Auth';
import {
  ClientRequest
} from '../views/ClientRequest';
import {
  CreateWallet,
  ImportWallet,
  Intro,
  Success,
} from '../views/Onboarding';
import { Send } from '../views/Send';
import { Transactions } from '../views/Transactions';

export default function App() {
  const { authenticated, wallet, onboardingComplete, ready } = useAppContext();

  if (!ready) return null;

  const BaseComponent = !onboardingComplete
      ? Intro
      : authenticated && wallet
      ? Transactions
      : Password;

  return (
    <Routes>
      <Route path='/' element={<BaseComponent />} />
      <Route path='/Intro' element={<Intro />} />
      <Route path='/CreateWallet' element={<CreateWallet />} />
      <Route path='/ImportWallet' element={<ImportWallet />} />
      <Route path='/Success' element={<Success />} />
      <Route path='/Password' element={<Password />} />
      <Route path='/Transactions/:tab?' element={<Transactions />} />
      <Route path='/ResetWallet' element={<ResetWallet />} />
      <Route path='/Send' element={<Send />} />
      <Route path='/ClientRequest' element={<ClientRequest />} />
    </Routes>
  );
}
