import { describe, expect, it } from "vitest";
import data from "@/lib/data/trackers.json";
import { KIND_DATA, appCategory, categorize, matchTracker } from "@/lib/trackers";
import { interceptBatchSchema } from "@/lib/validation";
import { en } from "@/i18n/en";
import { dictionaries } from "@/i18n";

describe("tracker matching", () => {
  it("matches a tracker domain and its subdomains", () => {
    expect(matchTracker("app-measurement.com")).toMatchObject({ org: "Google Analytics for Firebase", kind: "analytics" });
    expect(matchTracker("Pagead2.GoogleSyndication.com.")).toMatchObject({ org: "Google AdSense", kind: "ads", suffix: "googlesyndication.com" });
    expect(matchTracker("px.ads.linkedin.com")).toMatchObject({ kind: "pixel" });
  });
  it("never matches the apps' own working domains", () => {
    for (const d of ["graph.facebook.com", "i.instagram.com", "www.google.com", "api.whatsapp.net", "linkedin.com", "branch.io", "facebook.com"])
      expect(matchTracker(d)).toBeNull();
  });
  it("rejects malformed names", () => {
    expect(matchTracker("")).toBeNull();
    expect(matchTracker("doubleclick..net")).toBeNull();
    expect(matchTracker("doubleclick.net/evil")).toBeNull();
  });
  it("every entry is a valid domain with a known kind and no duplicates", () => {
    const seen = new Set<string>();
    for (const [d, org, kind] of data.trackers as [string, string, string][]) {
      expect(matchTracker(d), d).not.toBeNull();
      expect(Object.keys(data.kinds)).toContain(kind);
      expect(org.length).toBeGreaterThan(1);
      expect(seen.has(d), d).toBe(false);
      seen.add(d);
    }
  });
});

describe("auto-categorisation into the vault", () => {
  it("files by data kind and kind of app", () => {
    expect(categorize("com.instagram.android", "location")).toBe("location");
    expect(categorize("com.phonepe.app", "ads")).toBe("finance");
    expect(categorize("in.amazon.mShop.android.shopping", "analytics")).toBe("shopping");
    expect(categorize("com.android.chrome", "ads")).toBe("browsing");
    expect(categorize("com.example.fitnesstracker", "analytics")).toBe("lifestyle");
    expect(categorize("com.instagram.android", "ads")).toBe("device");
    expect(categorize("com.instagram.android", "pixel")).toBe("browsing");
    expect(categorize("com.instagram.android", "app")).toBe("other");
  });
  it("knows catalog apps by package", () => {
    expect(appCategory("net.one97.paytm")).toBe("finance");
    expect(appCategory("com.whatsapp")).toBeNull();
  });
  it("every kind has data labels in every language", () => {
    for (const keys of Object.values(KIND_DATA))
      for (const k of keys) for (const d of Object.values(dictionaries)) expect((d as Record<string, string>)[`dk.${k}`], k).toBeTruthy();
  });
});

describe("intercept batch validation", () => {
  const ok = { pkg: "com.instagram.android", label: "Instagram", domain: "an.facebook.com", trigger: "background", count: 3, first: 1_790_000_000_000, last: 1_790_000_005_000 };
  it("accepts a real batch", () => {
    expect(interceptBatchSchema.parse({ events: [ok] }).events[0].trigger).toBe("background");
  });
  it("rejects bad packages, triggers, counts and oversize batches", () => {
    expect(() => interceptBatchSchema.parse({ events: [{ ...ok, pkg: "not a package" }] })).toThrow();
    expect(() => interceptBatchSchema.parse({ events: [{ ...ok, trigger: "keylogger" }] })).toThrow();
    expect(() => interceptBatchSchema.parse({ events: [{ ...ok, count: 0 }] })).toThrow();
    expect(() => interceptBatchSchema.parse({ events: Array(201).fill(ok) })).toThrow();
    expect(() => interceptBatchSchema.parse({ events: [] })).toThrow();
  });
  it("has the stream strings", () => {
    expect(en["h.stream.blocked"]).toContain("DioTa");
  });
});
