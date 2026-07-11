export type VehicleImageUploadItem = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "complete" | "error";
  error: string | null;
};

export type VehicleImageUploadAction =
  | { type: "enqueue"; items: VehicleImageUploadItem[] }
  | { type: "progress"; id: string; progress: number }
  | { type: "complete"; id: string }
  | { type: "error"; id: string; error: string };

export function createVehicleImageUploadItems(
  files: readonly File[],
  remainingSlots: number,
  createId: () => string = () => crypto.randomUUID(),
): { items: VehicleImageUploadItem[]; rejectedCount: number } {
  const accepted = files.slice(0, Math.max(0, remainingSlots));
  return {
    items: accepted.map((file) => ({
      id: createId(),
      file,
      progress: 0,
      status: "queued",
      error: null,
    })),
    rejectedCount: Math.max(0, files.length - accepted.length),
  };
}

export function vehicleImageUploadReducer(
  state: readonly VehicleImageUploadItem[],
  action: VehicleImageUploadAction,
): VehicleImageUploadItem[] {
  if (action.type === "enqueue") return [...state, ...action.items];
  return state.map((item) => {
    if (item.id !== action.id) return item;
    if (action.type === "progress") {
      return {
        ...item,
        progress: Math.min(100, Math.max(0, Math.round(action.progress))),
        status: "uploading",
        error: null,
      };
    }
    if (action.type === "complete") {
      return { ...item, progress: 100, status: "complete", error: null };
    }
    return { ...item, status: "error", error: action.error };
  });
}
