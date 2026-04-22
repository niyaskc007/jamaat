import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result, Typography } from 'antd';
import { clientErrorReporter } from '../api/client';

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error; traceId?: string };

/**
 * Top-level React error boundary. Captures render/effect errors, reports them
 * to the backend error log, and shows a friendly fallback with a trace id the
 * user can quote to support.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, traceId: genTraceId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void clientErrorReporter.report({
      severity: 3,
      message: error.message || 'React render error',
      exceptionType: error.name,
      stackTrace: `${error.stack ?? ''}\n\nComponentStack:${info.componentStack ?? ''}`,
      endpoint: window.location.pathname,
      correlationId: this.state.traceId,
      userAgent: navigator.userAgent,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minBlockSize: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Result
          status="error"
          title="Something went wrong"
          subTitle={
            <span>
              We've recorded this error. Reference:{' '}
              <Typography.Text code>{this.state.traceId}</Typography.Text>
            </span>
          }
          extra={
            <Button type="primary" onClick={() => window.location.assign('/dashboard')}>
              Back to dashboard
            </Button>
          }
        />
      </div>
    );
  }
}

function genTraceId() {
  return 'web-' + Math.random().toString(16).slice(2, 10);
}
