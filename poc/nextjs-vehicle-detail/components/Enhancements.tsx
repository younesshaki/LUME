'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';

// ssr:false belongs in a Client Component, not directly in the server page.
const Viewer = dynamic(() => import('./Viewer'), { ssr: false, loading: () => <p>Loading viewer…</p> });
export default function Enhancements({ modelUrl, vehicleTitle }: { modelUrl?: string; vehicleTitle: string }) {
  const [show, setShow] = useState(false);
  const [chat, setChat] = useState(false);
  return <section>
    <h2>Optional interactive features</h2>
    <p>The 3D asset is LUME’s existing Red Bull product model, not a scan of this vehicle.</p>
    <button disabled={!modelUrl} onClick={() => setShow(!show)}>Inspect 3D proof</button>
    {show && modelUrl && <Viewer url={modelUrl} />}
    <button onClick={() => setChat(!chat)}>Ask about this vehicle</button>
    {chat && <div role="dialog" aria-label="Vehicle chat entry"><p>Context: {vehicleTitle}</p>
      <p>Chat entry point only. No chat messages are sent by this proof.</p></div>}
  </section>;
}
