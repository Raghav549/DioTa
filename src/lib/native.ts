"use client";
import { useSyncExternalStore } from "react";
/**
 * Bridge to the DioTa Android app (android/ in this repo).
 *
 * The Android app is a WebView around this website. It exposes `window.DioTaNative` (a
 * JavascriptInterface, which is not affected by the page's Content-Security-Policy). Calls are
 * asynchronous: we pass a call id, and the app answers by calling `window.__dioTaResolve(id, result)`.
 * In a normal browser `isNative()` is false and the web UI hides phone-only features.
 */

export type PermName = "usage" | "notifications" | "vpn" | "battery" | "camera" | "photos";

export type NativeStatus = {
  usage: boolean;
  notifications: boolean;
  vpn: boolean;
  battery: boolean;
  camera: boolean;
  photos: boolean;
  /** Installed-apps visibility is granted at install time (QUERY_ALL_PACKAGES). */
  apps: boolean;
  firewallRunning: boolean;
  /** Tracker shield (blocks tracker endpoints for every app on the phone) is on and running. */
  shield?: boolean;
  shieldRunning?: boolean;
  /** False while recording is paused because the account's storage is full. */
  capturing?: boolean;
  sdk: number;
  version: string;
};

export type PhoneApp = {
  pkg: string;
  label: string;
  system: boolean;
  /** Android permissions that are actually granted. */
  granted: string[];
  installedAt: number;
  updatedAt: number;
  /** Mobile + Wi-Fi bytes in the last 30 days; null without usage access. */
  dataBytes: number | null;
  /** Last foreground use (epoch ms); null without usage access. */
  lastUsed: number | null;
  /** PNG data URL (only when icons were requested). */
  icon?: string;
};

export type UpiResult = { status: string; txnId: string; txnRef: string; approvalRef: string; responseCode: string };

/** A blocked attempt as the phone reports it the moment it happens ("dt:intercepts" window event). */
export type LiveAttempt = { pkg: string; label: string; domain: string; trigger: string; app: boolean; org?: string; kind?: string; at: number };

export type Firewall = { packages: string[]; running: boolean; attempts: Record<string, number>; shield?: boolean };

type Bridge = { call: (id: string, method: string, args: string) => void };
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

declare global {
  interface Window {
    DioTaNative?: Bridge;
    __dioTaResolve?: (id: string, ok: boolean, payload: unknown) => void;
  }
}

const pending = new Map<string, Pending>();
let seq = 0;

export const isNative = () => typeof window !== "undefined" && !!window.DioTaNative;

const noop = () => () => {};
/** True inside the DioTa Android app (false during server rendering, so hydration stays consistent). */
export const useIsNative = () => useSyncExternalStore(noop, isNative, () => false);

function call<T>(method: string, args: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<T> {
  const bridge = typeof window !== "undefined" ? window.DioTaNative : undefined;
  if (!bridge) return Promise.reject(new Error("not_native"));
  if (!window.__dioTaResolve) {
    window.__dioTaResolve = (id, ok, payload) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve(payload);
      else p.reject(new Error(typeof payload === "string" ? payload : "native_error"));
    };
  }
  const id = `c${Date.now().toString(36)}${(seq++).toString(36)}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("timeout"));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v as T)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    bridge.call(id, method, JSON.stringify(args));
  });
}

export const Phone = {
  status: () => call<NativeStatus>("status"),
  /** Shows the Android permission dialog (or the settings page for special access). Resolves with the new status. */
  request: (name: PermName) => call<NativeStatus>("request", { name }, 10 * 60_000),
  listApps: (o: { includeSystem?: boolean; icons?: boolean; packages?: string[] } = {}) => call<{ apps: PhoneApp[] }>("listApps", o),
  firewall: () => call<Firewall>("firewall"),
  /** Replaces the list of apps whose internet is blocked. Starts or stops the on-device firewall. */
  setBlocked: (packages: string[]) => call<Firewall>("setBlocked", { packages }, 10 * 60_000),
  /**
   * Turns the tracker shield on or off. It needs the VPN permission (Android asks once).
   * `ask: false` never shows a dialog (used to follow the Protection switch silently).
   */
  setShield: (on: boolean, ask = true) => call<Firewall>("setShield", { on, ask }, 10 * 60_000),
  /** Sends blocked attempts waiting on the phone to your account now (never waits for the upload). */
  flushIntercepts: () => call<{ queued: number }>("flushIntercepts", {}, 10_000),
  /** Pauses (storage full) or resumes recording blocked attempts. Blocking itself never stops. */
  setCapture: (on: boolean) => call<{ capturing: boolean }>("setCapture", { on }),
  /** The first screen is on: the native launch splash may finish and fade away. */
  ready: () => call<{ ok: true }>("ready", {}, 5_000),
  /** Website theme, so the status bar icons and the next launch's colours match it. */
  appearance: (dark: boolean) => call<{ ok: true }>("appearance", { dark }, 5_000),
  /** Opens the phone's UPI apps for a prepared upi://pay link; resolves with the UPI app's answer. */
  payUpi: (url: string) => call<UpiResult>("payUpi", { url }, 30 * 60_000),
  openAppSettings: (pkg: string) => call<{ ok: true }>("openAppSettings", { pkg }),
  notify: (title: string, body: string) => call<{ ok: true }>("notify", { title, body }),
  saveFile: (name: string, mime: string, base64: string) => call<{ name: string; location: string }>("saveFile", { name, mime, base64 }),
};

/** UTF-8 text -> base64 (btoa only handles Latin-1). */
export function textToBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Saves a text file for the user: in the Android app it goes to Downloads/DioTa,
 * in a browser it downloads normally. Returns the file name.
 */
export async function saveTextFile(name: string, mime: string, text: string): Promise<string> {
  if (isNative()) {
    const r = await Phone.saveFile(name, mime, textToBase64(text));
    return r.location;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

/** Downloads the full account export (/api/me/export) as a real JSON file. */
export async function exportMyData(): Promise<string> {
  const res = await fetch("/api/me/export", { credentials: "same-origin", headers: { "x-dt-csrf": "1" } });
  if (!res.ok) throw new Error(res.status === 429 ? "rate" : "generic");
  const text = await res.text();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "dioTa-export.json";
  return saveTextFile(name, "application/json", text);
}
