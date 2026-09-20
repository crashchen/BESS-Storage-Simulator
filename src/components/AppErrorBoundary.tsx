import type { ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

export function AppErrorBoundary({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundary fallback={
            <main role="alert" className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
                <div className="max-w-md space-y-4 rounded-xl border border-red-400/40 p-6">
                    <h1 className="text-lg font-semibold">Simulator unavailable</h1>
                    <p className="text-sm text-slate-300">The app encountered an unexpected error. Reload to start a new simulation; the current run cannot be restored.</p>
                    <button type="button" onClick={() => window.location.reload()} className="rounded border border-slate-500 px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
                        Reload simulator
                    </button>
                </div>
            </main>
        }>
            {children}
        </ErrorBoundary>
    );
}
