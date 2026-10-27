import type { ReactNode, Ref } from "react";
export function VehicleInventoryView({
  title,
  loadError,
  toolbar,
  chips,
  showDemo,
  gridRef,
  loading,
  visibleTotalCount,
  activeCount,
  vehicleCount,
  emptyAction,
  grid,
  pagination,
  filters,
}: {
  title: string;
  loadError: boolean;
  toolbar?: ReactNode;
  chips?: ReactNode;
  showDemo: boolean;
  gridRef?: Ref<HTMLDivElement>;
  loading: boolean;
  visibleTotalCount: number | null;
  activeCount: number;
  vehicleCount: number;
  emptyAction?: ReactNode;
  grid: ReactNode;
  pagination?: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <section className="vehicleInventoryBlock">
      {title && (
        <div className="vehiclesPage__hero">
          <div className="vehiclesPage__lamp" aria-hidden="true" />
          <h2 className="vehiclesPage__title">{title}</h2>
        </div>
      )}

      {loadError ? (
        <div className="vehiclesPage__error">
          <p>Unable to load vehicle inventory. Please refresh to try again.</p>
        </div>
      ) : (
        <>
          {toolbar}

          {chips}

          {/* LUME's own concept inventory only; a dealership's listings are real. */}
          {showDemo ? (
            <p className="vehiclesPage__demoNotice">
              Concept demo: prices and imagery are representative until verified
              listing data is connected.
            </p>
          ) : null}

          <div className="vehiclesPage__resultsBar" ref={gridRef}>
            {!loading && visibleTotalCount !== null && (
              <span className="vehiclesPage__resultCount">
                {visibleTotalCount} vehicle{visibleTotalCount !== 1 ? "s" : ""}
                {activeCount > 0 ? " matching filters" : ""}
              </span>
            )}
          </div>

          {loading ? (
            <div className="vehiclesPage__loading">
              <span>Loading vehicles...</span>
            </div>
          ) : vehicleCount === 0 ? (
            <div className="vehiclesPage__empty">
              <p>No vehicles match your filters.</p>
              {emptyAction}
            </div>
          ) : (
            <>
              {grid}

              {pagination}
            </>
          )}
        </>
      )}
      {filters}
    </section>
  );
}
