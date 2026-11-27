import type { Permission } from "@/lib/catalog";

/**
 * Real Android runtime permissions -> DioTa permission groups.
 * The Android app reads which permissions each installed app has actually been GRANTED
 * (PackageManager, REQUESTED_PERMISSION_GRANTED) and the server maps them here.
 */
const MAP: Record<string, Permission> = {
  "android.permission.ACCESS_FINE_LOCATION": "location",
  "android.permission.ACCESS_COARSE_LOCATION": "location",
  "android.permission.ACCESS_BACKGROUND_LOCATION": "location",
  "android.permission.ACCESS_MEDIA_LOCATION": "location",
  "android.permission.CAMERA": "camera",
  "android.permission.RECORD_AUDIO": "microphone",
  "android.permission.READ_CONTACTS": "contacts",
  "android.permission.WRITE_CONTACTS": "contacts",
  "android.permission.GET_ACCOUNTS": "contacts",
  "android.permission.READ_EXTERNAL_STORAGE": "photos",
  "android.permission.WRITE_EXTERNAL_STORAGE": "photos",
  "android.permission.READ_MEDIA_IMAGES": "photos",
  "android.permission.READ_MEDIA_VIDEO": "photos",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED": "photos",
  "android.permission.MANAGE_EXTERNAL_STORAGE": "photos",
  "android.permission.READ_SMS": "sms",
  "android.permission.SEND_SMS": "sms",
  "android.permission.RECEIVE_SMS": "sms",
  "android.permission.RECEIVE_MMS": "sms",
  "android.permission.READ_PHONE_STATE": "phone",
  "android.permission.READ_PHONE_NUMBERS": "phone",
  "android.permission.CALL_PHONE": "phone",
  "android.permission.READ_CALL_LOG": "phone",
  "android.permission.WRITE_CALL_LOG": "phone",
  "android.permission.ANSWER_PHONE_CALLS": "phone",
  "android.permission.READ_CALENDAR": "calendar",
  "android.permission.WRITE_CALENDAR": "calendar",
  "android.permission.POST_NOTIFICATIONS": "notifications",
};

/** Granted Android permission names -> sorted, de-duplicated DioTa permission groups. */
export function mapAndroidPermissions(granted: readonly string[]): Permission[] {
  const out = new Set<Permission>();
  for (const g of granted) {
    const p = MAP[g];
    if (p) out.add(p);
  }
  return [...out].sort();
}
