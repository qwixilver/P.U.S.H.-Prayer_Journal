import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error('Render error:', err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="p-4">
          <h2 className="text-red-400 font-bold mb-2">Something went wrong.</h2>
          <pre className="text-sm text-red-300 whitespace-pre-wrap">
            {String(this.state.err?.message || this.state.err)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
