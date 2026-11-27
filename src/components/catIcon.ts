import type { IconName } from "@/components/Icon";
import type { Category } from "@/lib/catalog";

export const CAT_ICON: Record<Category, IconName> = {
  finance: "bank",
  shopping: "apps",
  location: "globe",
  browsing: "search",
  lifestyle: "activity",
  device: "device",
  other: "file",
};
