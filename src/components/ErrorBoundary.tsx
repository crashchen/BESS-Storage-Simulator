import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        if (import.meta.env.DEV) console.error('UI unavailable', error, info);
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
