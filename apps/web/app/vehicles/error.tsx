"use client";
export default function VehicleError({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>Vehicle information is temporarily unavailable</h1>
      <p>Please try again shortly.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
