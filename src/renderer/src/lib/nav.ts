// The pages, in the sidebar's order, with their icons and shortcuts.
import { Bot, CalendarDays, Car, CheckSquare, Bookmark, LayoutDashboard, NotebookPen, Package, ShoppingCart, Users, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; n?: string; badge?: BadgeKey };
export type BadgeKey = "today" | "overdue" | "buy" | "dates" | "car" | "things" | "approvals";

export const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Plan",
    items: [
      { to: "/", label: "Today", icon: LayoutDashboard, n: "1", badge: "today" },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, n: "2" },
      { to: "/todos", label: "To-dos", icon: CheckSquare, n: "3", badge: "overdue" },
      { to: "/lists", label: "Lists", icon: ShoppingCart, n: "4", badge: "buy" },
    ],
  },
  {
    title: "Keep",
    items: [
      { to: "/notes", label: "Notes", icon: NotebookPen, n: "5" },
      { to: "/saved", label: "Saved text", icon: Bookmark },
    ],
  },
  {
    title: "Life",
    items: [
      { to: "/money", label: "Money", icon: Wallet, n: "6" },
      { to: "/people", label: "People & dates", icon: Users, n: "7", badge: "dates" },
      { to: "/car", label: "My car", icon: Car, badge: "car" },
      { to: "/things", label: "My things", icon: Package, badge: "things" },
    ],
  },
  { title: "Help", items: [{ to: "/assistant", label: "Assistant", icon: Bot, n: "8", badge: "approvals" }] },
];

export const ALL_PAGES = NAV.flatMap((g) => g.items);
export const pageFor = (path: string) => ALL_PAGES.find((p) => (p.to === "/" ? path === "/" : path === p.to || path.startsWith(`${p.to}/`)));
