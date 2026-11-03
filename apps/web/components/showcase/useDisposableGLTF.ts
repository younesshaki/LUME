"use client";
import { useEffect, useState } from "react";
import { createModelResource, type ModelResource } from "./model-resource";
/** Unlike the reference Vite hook, this has no global parsed-GLTF cache.
 * Geometry/material/texture ownership is exclusive, allowing complete disposal.
 * Browser HTTP caching may reuse bytes without sharing GPU object lifetimes.
 */
export function useDisposableGLTF(url: string, attempt: number) {
  const key = `${url}\n${attempt}`;
  const [binding, setBinding] = useState<{
    key: string;
    resource: ModelResource;
  } | null>(null);
  useEffect(() => {
    const resource = createModelResource(url);
    setBinding({ key, resource });
    return () => resource.dispose();
  }, [key, url]);
  return binding?.key === key ? binding.resource : null;
}
