import type { ReactNode } from "react";

type LoaderShellProps = {
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function LoaderShell({ className, children, footer }: LoaderShellProps) {
  return (
    <div className="loadingIndicator" role="status" aria-live="polite">
      <div className={`loader-container${className ? ` ${className}` : ""}`}>{children}</div>
      {footer}
    </div>
  );
}
