"use client";
import { Component, type ReactNode } from "react";
import { EmptyModelError } from "./model-policy";
export function LoadingModel() {
  return (
    <div className="showcase__state" role="status">
      <p>Loading the product…</p>
      <p>The rest of the site remains available.</p>
    </div>
  );
}
export default class ModelBoundary extends Component<
  { children: ReactNode; retry: () => void; failed: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch() {
    this.props.failed();
  }
  render() {
    if (!this.state.error) return this.props.children;
    const empty = this.state.error instanceof EmptyModelError;
    return (
      <div className="showcase__state" role="alert">
        <h2>
          {empty ? "No 3D view is available" : "The 3D view is unavailable"}
        </h2>
        <p>
          {empty
            ? "This model has no viewable geometry."
            : "The model could not be loaded. You can try again or continue using the navigation."}
        </p>
        <button onClick={this.props.retry}>Try again</button>
      </div>
    );
  }
}
