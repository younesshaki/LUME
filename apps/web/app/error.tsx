"use client";
export default function ContentError({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>Published content is temporarily unavailable</h1>
      <p>Please try again shortly.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
