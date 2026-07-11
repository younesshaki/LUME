import {
  MAX_VEHICLE_IMAGE_BYTES,
  type VehicleImageContentType,
} from "./vehicleImages";

export type ConfirmedVehicleImage = {
  id: string;
  r2_key: string;
  content_type: VehicleImageContentType;
  byte_size: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
  url: string;
};

type UploadUrlResponse = {
  uploadUrl: string;
  r2Key: string;
  requiredHeaders?: Record<string, string>;
};

export async function uploadVehicleImage(
  vehicleId: string,
  tenantSlug: string,
  file: File,
  onProgress: (percentage: number) => void,
): Promise<ConfirmedVehicleImage> {
  const contentType = vehicleImageContentType(file.type);
  if (!contentType || file.size < 1 || file.size > MAX_VEHICLE_IMAGE_BYTES) {
    throw new Error("Choose a JPEG, PNG, or WebP image up to 10 MB.");
  }

  const [uploadTarget, dimensions] = await Promise.all([
    requestUploadUrl(vehicleId, tenantSlug, file, contentType),
    readImageDimensions(file),
  ]);
  await putFile(uploadTarget, file, onProgress);

  const response = await fetch(`/api/vehicles/${encodeURIComponent(vehicleId)}/images`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Lume-Tenant": tenantSlug,
    },
    body: JSON.stringify({
      r2Key: uploadTarget.r2Key,
      contentType,
      byteSize: file.size,
      ...dimensions,
    }),
  });
  const payload = await readResponse(response);
  if (!response.ok || !isRecord(payload.image)) {
    throw new Error(apiError(payload, "Unable to confirm the uploaded image."));
  }
  return payload.image as ConfirmedVehicleImage;
}

async function requestUploadUrl(
  vehicleId: string,
  tenantSlug: string,
  file: File,
  contentType: VehicleImageContentType,
): Promise<UploadUrlResponse> {
  const response = await fetch(
    `/api/vehicles/${encodeURIComponent(vehicleId)}/images/upload-url`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Lume-Tenant": tenantSlug,
      },
      body: JSON.stringify({ fileName: file.name, contentType, byteSize: file.size }),
    },
  );
  const payload = await readResponse(response);
  if (
    !response.ok ||
    typeof payload.uploadUrl !== "string" ||
    typeof payload.r2Key !== "string"
  ) {
    throw new Error(apiError(payload, "Unable to prepare the image upload."));
  }
  return {
    uploadUrl: payload.uploadUrl,
    r2Key: payload.r2Key,
    requiredHeaders: isStringRecord(payload.requiredHeaders)
      ? payload.requiredHeaders
      : undefined,
  };
}

function putFile(
  target: UploadUrlResponse,
  file: File,
  onProgress: (percentage: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.uploadUrl);
    for (const [name, value] of Object.entries(target.requiredHeaders ?? {})) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`R2 upload failed with status ${xhr.status}.`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("R2 upload failed.")));
    xhr.addEventListener("abort", () => reject(new Error("R2 upload was cancelled.")));
    xhr.send(file);
  });
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      cleanup();
      resolve(dimensions);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("The selected image could not be decoded."));
    };
    image.src = objectUrl;
  });
}

function vehicleImageContentType(value: string): VehicleImageContentType | null {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp"
    ? value
    : null;
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function apiError(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}
