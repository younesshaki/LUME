export type DeleteVehicleImageResult = {
  promotedImageId: string | null;
  warning: string | null;
};

export async function persistVehicleImageOrder(
  vehicleId: string,
  tenantSlug: string,
  imageIds: string[],
): Promise<void> {
  await request(`/api/vehicles/${encodeURIComponent(vehicleId)}/images/order`, tenantSlug, {
    method: "POST",
    body: JSON.stringify({ imageIds }),
  });
}

export async function persistPrimaryVehicleImage(
  vehicleId: string,
  imageId: string,
  tenantSlug: string,
): Promise<void> {
  await request(
    `/api/vehicles/${encodeURIComponent(vehicleId)}/images/${encodeURIComponent(imageId)}/primary`,
    tenantSlug,
    { method: "POST" },
  );
}

export async function deleteManagedVehicleImage(
  vehicleId: string,
  imageId: string,
  tenantSlug: string,
): Promise<DeleteVehicleImageResult> {
  const payload = await request(
    `/api/vehicles/${encodeURIComponent(vehicleId)}/images/${encodeURIComponent(imageId)}`,
    tenantSlug,
    { method: "DELETE" },
  );
  return {
    promotedImageId: typeof payload.promotedImageId === "string"
      ? payload.promotedImageId
      : null,
    warning: typeof payload.warning === "string" ? payload.warning : null,
  };
}

async function request(
  url: string,
  tenantSlug: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Lume-Tenant": tenantSlug,
      ...init.headers,
    },
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Vehicle image update failed.",
    );
  }
  return payload;
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
