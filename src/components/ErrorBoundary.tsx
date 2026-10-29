import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-[#141414] border border-red-500/20 rounded-lg text-center m-4 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider mb-2">
            {this.props.fallbackTitle || 'Workspace Rendering Recovered'}
          </h3>
          <p className="text-xs text-gray-400 mb-6 max-w-sm">
            {this.state.error?.message || 'A temporary font or glyph rendering issue occurred. Your saved projects and workspace data remain safe.'}
          </p>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold uppercase tracking-wider transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload View
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-gray-200 rounded text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Refresh Browser
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
