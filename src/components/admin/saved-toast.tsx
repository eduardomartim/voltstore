"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function SavedToast({ message, path }: { message: string; path: string }) {
  useEffect(() => {
    toast.success(message, { id: `saved:${path}` }); // id dedupes StrictMode double effects
    window.history.replaceState(null, "", path);
  }, [message, path]);
  return null;
}
