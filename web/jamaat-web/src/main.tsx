import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ConfigProvider, App as AntdApp } from 'antd';
import { HelmetProvider } from 'react-helmet-async';
import { App } from './app/App';
import { queryClient } from './app/queryClient';
import { jamaatTheme } from './app/theme';
import { ErrorBoundary } from './shared/ui/ErrorBoundary';
import './shared/i18n/i18n';
import './shared/format/dayjsSetup';
import './index.css';

// Global runtime handlers → push to backend error log
import { clientErrorReporter } from './shared/api/client';

window.addEventListener('error', (e) => {
  void clientErrorReporter.report({
    severity: 3,
    message: e.message,
    exceptionType: 'WindowError',
    stackTrace: e.error?.stack,
    endpoint: window.location.pathname,
    userAgent: navigator.userAgent,
  });
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason as Error | string | undefined;
  void clientErrorReporter.report({
    severity: 3,
    message: typeof reason === 'string' ? reason : reason?.message ?? 'Unhandled promise rejection',
    exceptionType: 'UnhandledRejection',
    stackTrace: typeof reason === 'object' ? reason?.stack : undefined,
    endpoint: window.location.pathname,
    userAgent: navigator.userAgent,
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <ConfigProvider theme={jamaatTheme}>
            <AntdApp>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </AntdApp>
          </ConfigProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
);
