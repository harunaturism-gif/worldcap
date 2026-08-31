import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MiniKitProvider } from '@worldcoin/minikit-js/minikit-provider';
import App from './App';
import { AuthGate } from './components/auth/AuthGate';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { AuthService } from './services/authService';
import './index.css';

const application = <AuthGate>{(session, logout) => <App session={session} logout={logout} />}</AuthGate>;
const withMiniKit = AuthService.isDevelopmentBypass() ? application : <MiniKitProvider>{application}</MiniKitProvider>;

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary>{withMiniKit}</ErrorBoundary></StrictMode>);

