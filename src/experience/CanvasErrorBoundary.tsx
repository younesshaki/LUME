import { Component, type ReactNode } from "react";

type CanvasErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type CanvasErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export default class CanvasErrorBoundary extends Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  state: CanvasErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("Canvas error boundary caught:", error);
  }

  // Reset error state when key changes (triggered by parent re-render)
  componentDidUpdate(prevProps: CanvasErrorBoundaryProps) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#0b0b0b",
              color: "#f2f2f2",
              fontFamily: "var(--experience-font-family)",
              fontSize: "14px",
              textAlign: "center",
              padding: "24px",
            }}
          >
            Something went wrong while rendering the scene.
          </div>
        )
      );
    }

    return this.props.children;
  }
}
