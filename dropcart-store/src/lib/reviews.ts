import { useCallback, useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";

export type Review = { id: string; name: string; rating: number; body: string; avatar: string | null; createdAt: string };
export type ReviewData = {
  summary: { count: number; average: number; breakdown: Record<"1" | "2" | "3" | "4" | "5", number> };
  reviews: Review[];
};

export const REVIEWS_CHANGED = "buydo:reviews-changed";
export const notifyReviewsChanged = () => window.dispatchEvent(new Event(REVIEWS_CHANGED));

const EMPTY: ReviewData = { summary: { count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, reviews: [] };

/** Published reviews and their summary. Reloads by itself when a customer posts a review. */
export function useReviews() {
  const [data, setData] = useState<ReviewData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await customFetch<ReviewData>("/api/reviews", { cache: "no-store" }));
    } catch {
      /* keep what we have */
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void load();
    window.addEventListener(REVIEWS_CHANGED, load);
    return () => window.removeEventListener(REVIEWS_CHANGED, load);
  }, [load]);
  return { ...data, loaded };
}

/** Centre-crop to a small square JPEG so the photo stays a few KB. Returns a data URL. */
export async function resizeAvatar(file: File, size = 96): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image couldn't be opened"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser can't process photos");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}
