/* Declarations shared between this screen and a component extracted out of it
   in phase 4. Contents unchanged. */
import { Icon, Text, type IconName } from "@/components/common";

export const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "menu", label: "Menu", icon: "menu" },
  { name: "orders", label: "Orders", icon: "doc" },
  { name: "profile", label: "Profile", icon: "profile" },
];
