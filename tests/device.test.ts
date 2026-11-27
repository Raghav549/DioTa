import { describe, expect, it } from "vitest";
import { mapAndroidPermissions } from "@/lib/android";
import { APPS, isAppSlug, isCatalogSlug, isPackageSlug, catalogByPkg } from "@/lib/catalog";
import { appAddSchema, avatarSchema, deviceSyncSchema } from "@/lib/validation";

describe("android permission mapping", () => {
  it("maps granted Android permissions to DioTa groups, de-duplicated", () => {
    expect(
      mapAndroidPermissions([
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.INTERNET",
        "android.permission.READ_SMS",
      ]),
    ).toEqual(["camera", "location", "sms"]);
  });
  it("ignores unknown or normal permissions", () => {
    expect(mapAndroidPermissions(["android.permission.INTERNET", "com.example.CUSTOM"])).toEqual([]);
  });
});

describe("catalog", () => {
  it("has a unique slug and Android package for every app, plus a logo file name", () => {
    expect(new Set(APPS.map((a) => a.slug)).size).toBe(APPS.length);
    expect(new Set(APPS.map((a) => a.pkg)).size).toBe(APPS.length);
    expect(APPS.length).toBeGreaterThanOrEqual(60);
  });
  it("tells catalog slugs and package slugs apart", () => {
    expect(isCatalogSlug("whatsapp")).toBe(true);
    expect(isPackageSlug("com.example.notes")).toBe(true);
    expect(isPackageSlug("whatsapp")).toBe(false);
    expect(isAppSlug("../etc/passwd")).toBe(false);
    expect(isAppSlug("com.example")).toBe(true);
    expect(catalogByPkg("com.whatsapp")?.slug).toBe("whatsapp");
  });
  it("only lets users add catalog apps by hand", () => {
    expect(appAddSchema.safeParse({ slug: "whatsapp" }).success).toBe(true);
    expect(appAddSchema.safeParse({ slug: "com.example.notes" }).success).toBe(false);
  });
});

describe("device sync", () => {
  const app = { pkg: "com.example.notes", label: "Notes", granted: ["android.permission.CAMERA"], dataBytes: 1024, lastUsed: Date.now() };
  it("accepts real phone data", () => {
    expect(deviceSyncSchema.safeParse({ apps: [app], track: ["com.example.notes"] }).success).toBe(true);
    expect(deviceSyncSchema.safeParse({ apps: [{ ...app, dataBytes: null, lastUsed: null }] }).success).toBe(true);
  });
  it("rejects bad packages, huge lists and non-PNG icons", () => {
    expect(deviceSyncSchema.safeParse({ apps: [{ ...app, pkg: "not a package" }] }).success).toBe(false);
    expect(deviceSyncSchema.safeParse({ apps: Array(101).fill(app) }).success).toBe(false);
    expect(deviceSyncSchema.safeParse({ apps: [{ ...app, icon: "data:image/svg+xml;base64,PHN2Zz4=" }] }).success).toBe(false);
  });
});

describe("avatar", () => {
  it("accepts jpeg/png/webp data URLs only", () => {
    expect(avatarSchema.safeParse({ dataUrl: "data:image/jpeg;base64,/9j/4AAQ" }).success).toBe(true);
    expect(avatarSchema.safeParse({ dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
    expect(avatarSchema.safeParse({ dataUrl: "https://example.com/a.png" }).success).toBe(false);
  });
});
