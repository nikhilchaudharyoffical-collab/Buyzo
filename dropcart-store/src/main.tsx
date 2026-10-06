import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
if (apiUrl) {
  setBaseUrl(apiUrl);
}

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    const errMessage = error instanceof Error ? error.message : String(error);
    alert("REACT CAUGHT CRASH: " + errMessage);
    console.error(error, errorInfo.componentStack);
  },
  onUncaughtError: (error) => {
    const errMessage = error instanceof Error ? error.message : String(error);
    alert("REACT UNCAUGHT CRASH: " + errMessage);
  }
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
