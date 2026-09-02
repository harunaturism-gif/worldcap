import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };
  public static getDerivedStateFromError(error: Error): State { return { error }; }
  public componentDidCatch(error: Error, details: ErrorInfo) { if (import.meta.env.DEV) console.error('WorldCAP UI error', error, details); }

  public render() {
    if (!this.state.error) return this.props.children;
    return <main className="fatal-screen" role="alert">
      <section className="fatal-card">
        <span className="icon-tile danger"><RefreshCw aria-hidden="true" /></span>
        <p className="eyebrow">Safe recovery</p>
        <h1>CAP paused</h1>
        <p>Your local demo data is still on this device. Try rendering the app again or reload it.</p>
        <div className="button-row">
          <button className="primary-button" onClick={() => this.setState({ error: null })}><RotateCcw size={18} /> Try again</button>
          <button className="secondary-button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </section>
    </main>;
  }
}
