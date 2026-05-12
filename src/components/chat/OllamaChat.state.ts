import { useEffect } from "react";
import { useUIStore } from "@/lib/ui-state";

export function useOllamaChatStateBridge(isOpen: boolean, busy: boolean) {
  const setChat = useUIStore((state) => state.setChat);

  useEffect(() => {
    setChat({ open: isOpen, busy });
  }, [busy, isOpen, setChat]);

  useEffect(() => {
    return () => setChat({ open: false, busy: false });
  }, [setChat]);
}
