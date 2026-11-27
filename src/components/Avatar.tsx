"use client";
import { useState } from "react";

export type AvatarUser = { name: string; avatar?: string | null };

/** Profile photo, or the user's initials when there is no photo. */
export function Avatar({ user, size = 44, className = "" }: { user: AvatarUser | null | undefined; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const initials = (user?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const src = user?.avatar && broken !== user.avatar ? user.avatar : null;
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#0d0d0f] font-semibold text-white ring-2 ring-[var(--bg)] ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(src)} />
      ) : (
        <span aria-hidden>{initials || "•"}</span>
      )}
    </span>
  );
}

/**
 * Turns a picked image file into a small square JPEG data URL (center-cropped, max 384px),
 * so uploads stay small and any odd format/orientation from the camera is normalised.
 */
export async function imageFileToDataUrl(file: File, max = 384): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");
  if (file.size > 25 * 1024 * 1024) throw new Error("too_big");
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  const source: CanvasImageSource & { width: number; height: number } =
    bmp ??
    (await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("decode"));
      img.src = URL.createObjectURL(file);
    }));
  const side = Math.min(source.width, source.height);
  const out = Math.min(max, side);
  const c = document.createElement("canvas");
  c.width = out;
  c.height = out;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, out, out);
  bmp?.close();
  return c.toDataURL("image/jpeg", 0.86);
}
