import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/** A page crash shows a recoverable card instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  componentDidCatch(error: Error) { console.error('Page crashed:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel mx-auto mt-10 max-w-md p-5 text-center">
        <AlertTriangle size={22} className="mx-auto" style={{ color: 'var(--amber)' }} />
        <div className="mt-2 text-[14px] font-extrabold">This page hit a problem</div>
        <div className="mt-1 text-[12px] text-[var(--muted)]">Your data is safe. Try again, or open another page.</div>
        <button className="btn btn-primary mx-auto mt-3" onClick={() => this.setState({ error: null })}><RotateCcw size={13} />Try again</button>
      </div>
    );
  }
}
