import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0F1115] p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="inline-flex p-3 bg-[#F85149]/10 text-[#F85149] rounded-full border border-[#F85149]/20">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-lg font-bold text-white font-mono">Application Error</h1>
            <p className="text-xs text-[#8B949E] font-mono leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
            >
              <RefreshCcw size={14} />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
