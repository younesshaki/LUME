import { CarFront, House, Mail, Package, Sparkles } from "lucide-react";
import type React from "react";

export type SiteScreen = "home" | "products" | "vehicles" | "showcase" | "contact";

export type SiteNavItem = {
  label: string;
  screen: SiteScreen;
  icon: React.ReactNode;
};

export const SITE_NAV_ITEMS: SiteNavItem[] = [
  { label: "Home", screen: "home", icon: <House size={18} strokeWidth={1.9} /> },
  { label: "Products", screen: "products", icon: <Package size={18} strokeWidth={1.9} /> },
  { label: "Vehicles", screen: "vehicles", icon: <CarFront size={18} strokeWidth={1.9} /> },
  { label: "Showcase", screen: "showcase", icon: <Sparkles size={18} strokeWidth={1.9} /> },
  { label: "Contact", screen: "contact", icon: <Mail size={18} strokeWidth={1.9} /> },
];
