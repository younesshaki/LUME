"use client";

/**
 * Admin chrome: collapsible sidebar (tenant switcher, per-section nav with
 * active states, platform entry), header with breadcrumbs + theme toggle,
 * and the Cmd+K command palette. Pure presentation — all data arrives as
 * props from the server layout.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Bell,
  Bot,
  BookOpen,
  Building2,
  Car,
  ChevronRight,
  ChevronsUpDown,
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  Award,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Palette,
  PanelTop,
  Route,
  Repeat2,
  Plus,
  Search,
  Settings,
  CheckCheck,
  Users,
  UsersRound,
  Webhook as WebhookIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { ConciergeRobotCompanion } from "@/components/concierge-robot-companion";
import {
  ConciergeRobotProvider,
  ConciergeRobotSlot,
  ConciergeRobotToggle,
} from "@/components/concierge-robot-provider";
import { NavLoaderProvider, useNavLoader } from "@/components/navigation-loader";
import {
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "@/app/admin/notification-actions";

export type ShellTenant = {
  id: string;
  slug: string;
  name: string;
  role: string;
  siteUrl: string;
  unreadCount: number;
  sidebarSingleExpand: boolean;
};

export type ShellNotification = {
  id: string;
  tenant_id: string;
  type: "lead.created" | "domain.verified" | "storage.quota_warning" | "csv_import.completed";
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

type AdminShellProps = {
  email: string;
  tenants: ShellTenant[];
  notifications: ShellNotification[];
  isPlatformAdmin: boolean;
  flagshipUrl: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
};

const SECTIONS = [
  { slug: "", label: "Overview", icon: LayoutDashboard },
  { slug: "vehicles", label: "Vehicles", icon: Car },
  {
    label: "CRM",
    icon: UsersRound,
    children: [
      { slug: "leads", label: "Leads", icon: Inbox },
      { slug: "customers", label: "Customers", icon: Users },
      { slug: "loyalty", label: "Loyalty", icon: Award },
    ],
  },
  {
    label: "Website",
    icon: LayoutTemplate,
    children: [
      { slug: "website", label: "Overview", icon: LayoutDashboard },
      { slug: "pages", label: "Pages", icon: FileText },
      { slug: "templates", label: "Templates", icon: LayoutTemplate },
      { slug: "design", label: "Design", icon: Palette },
      { slug: "navigation", label: "Navigation", icon: PanelTop },
      { slug: "branding", label: "Brand assets", icon: ImageIcon },
      { slug: "assets", label: "Assets", icon: ImageIcon },
    ],
  },
  {
    label: "AI Concierge",
    icon: Bot,
    children: [
      { slug: "persona", label: "Bot Config", icon: Bot },
      { slug: "concierge-targets", label: "Targets", icon: Route },
      { slug: "knowledge", label: "Knowledge", icon: BookOpen },
    ],
  },
  { slug: "analytics", label: "Analytics", icon: BarChart3 },
  {
    label: "Settings",
    icon: Settings,
    children: [
      { slug: "team", label: "Team", icon: Users },
      { slug: "domains", label: "Domains", icon: Globe },
      { slug: "settings/billing", label: "Billing", icon: CreditCard },
      { slug: "settings/api-keys", label: "API Keys", icon: KeyRound },
      { slug: "settings/integrations", label: "Integrations", icon: WebhookIcon },
      { slug: "settings/inventory-feeds", label: "Inventory feeds", icon: Repeat2 },
      { slug: "settings/system-preferences", label: "System preferences", icon: Settings },
    ],
  },
] as const;

/**
 * Flattened navigable pages (group children lifted to the top level, inheriting
 * the group icon). Used by the breadcrumb resolver and command palette, which
 * address pages by a single slug and must not know about the sidebar's grouping.
 */
type NavLeaf = { slug: string; label: string; icon: LucideIcon };
const NAV_LEAVES: NavLeaf[] = SECTIONS.flatMap<NavLeaf>((section) =>
  "children" in section
    ? section.children.map((child) => ({
        slug: child.slug,
        label: child.label,
        icon: child.icon,
      }))
    : [{ slug: section.slug, label: section.label, icon: section.icon }],
);

function useActiveTenant(tenants: ShellTenant[], pathname: string): ShellTenant | null {
  const fromPath = pathname.match(/^\/admin\/([^/]+)/)?.[1];
  return tenants.find((tenant) => tenant.slug === fromPath) ?? tenants[0] ?? null;
}

export function AdminShell({
  email,
  tenants,
  notifications,
  isPlatformAdmin,
  flagshipUrl,
  signOutAction,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const activeTenant = useActiveTenant(tenants, pathname);
  const [expandedSections, setExpandedSections] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const activeSection = activeTenant
    ? SECTIONS.find(
        (section) =>
          "children" in section &&
          section.children.some((child) =>
            pathname.startsWith(`/admin/${activeTenant.slug}/${child.slug}`),
          ),
      )?.label ?? null
    : null;

  React.useEffect(() => {
    if (!activeSection) return;
    setExpandedSections((previous) => {
      if (activeTenant?.sidebarSingleExpand) return new Set([activeSection]);
      if (previous.has(activeSection)) return previous;
      return new Set([...previous, activeSection]);
    });
  }, [activeSection, activeTenant?.id, activeTenant?.sidebarSingleExpand]);

  const setSectionOpen = React.useCallback(
    (sectionLabel: string, open: boolean) => {
      setExpandedSections((previous) => {
        const next = new Set(previous);
        if (!open) {
          next.delete(sectionLabel);
          return next;
        }
        return activeTenant?.sidebarSingleExpand ? new Set([sectionLabel]) : next.add(sectionLabel);
      });
    },
    [activeTenant?.sidebarSingleExpand],
  );

  return (
    // The head parks in the sidebar's spare space; expanding a group claims
    // that space, so it moves back to the corner until the group is closed.
    <ConciergeRobotProvider parked={expandedSections.size === 0}>
    <NavLoaderProvider>
    {/* This shadcn sidebar version does not mount its own TooltipProvider;
        the collapsed-rail tooltips crash without one. */}
    <TooltipProvider delayDuration={0}>
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <TenantSwitcher tenants={tenants} active={activeTenant} />
        </SidebarHeader>
        <SidebarContent>
          {isPlatformAdmin && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/admin/platform"}
                      tooltip="Platform"
                    >
                      <Link href="/admin/platform">
                        <Building2 />
                        <span>Platform</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          {activeTenant && (
            <SidebarGroup>
              <SidebarGroupLabel>{activeTenant.name}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {SECTIONS.map((section) => {
                    if ("children" in section) {
                      const childHref = (slug: string) =>
                        `/admin/${activeTenant.slug}/${slug}`;
                      // Every group behaves the same: the header only toggles the
                      // list. Pages (including a section's own hub) are always
                      // reached as child items — one predictable rule, no split
                      // click target.
                      const groupActive = section.children.some((child) =>
                        pathname.startsWith(childHref(child.slug)),
                      );
                      return (
                        <Collapsible
                          key={section.label}
                          asChild
                          open={expandedSections.has(section.label)}
                          onOpenChange={(open) => setSectionOpen(section.label, open)}
                          className="group/collapsible"
                        >
                          <SidebarMenuItem>
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton tooltip={section.label} isActive={groupActive}>
                                <section.icon />
                                <span>{section.label}</span>
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                              </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub>
                                {section.children.map((child) => (
                                  <SidebarMenuSubItem key={child.slug}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={pathname.startsWith(childHref(child.slug))}
                                    >
                                      <Link href={childHref(child.slug)}>
                                        <child.icon />
                                        <span>{child.label}</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                ))}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </SidebarMenuItem>
                        </Collapsible>
                      );
                    }

                    const href = section.slug
                      ? `/admin/${activeTenant.slug}/${section.slug}`
                      : `/admin/${activeTenant.slug}`;
                    const isActive = section.slug
                      ? pathname.startsWith(href)
                      : pathname === href;
                    return (
                      <SidebarMenuItem key={section.label}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={section.label}>
                          <Link href={href}>
                            <section.icon />
                            <span>{section.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="View website">
                      <a href={activeTenant.siteUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink />
                        <span>View website</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <ConciergeRobotSlot />
        </SidebarContent>
        <SidebarFooter>
          <UserMenu
            email={email}
            isPlatformAdmin={isPlatformAdmin}
            flagshipUrl={flagshipUrl}
            signOutAction={signOutAction}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <ShellHeader
          tenants={tenants}
          activeTenant={activeTenant}
          notifications={notifications}
          isPlatformAdmin={isPlatformAdmin}
        />
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
    <ConciergeRobotCompanion />
    </TooltipProvider>
    </NavLoaderProvider>
    </ConciergeRobotProvider>
  );
}

function TenantSwitcher({ tenants, active }: { tenants: ShellTenant[]; active: ShellTenant | null }) {
  const router = useRouter();
  const { start } = useNavLoader();

  if (!active) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Create your site">
            <Link href="/admin/onboarding">
              <Plus />
              <span>Create your site</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
                {active.name.charAt(0).toUpperCase()}
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{active.name}</span>
                <span className="truncate text-xs text-muted-foreground capitalize">{active.role}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56" align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Tenants</DropdownMenuLabel>
            {tenants.map((tenant) => (
              <DropdownMenuItem key={tenant.id} onSelect={() => { start(); router.push(`/admin/${tenant.slug}`); }}>
                <div className="flex size-6 items-center justify-center rounded-sm border font-medium">
                  {tenant.name.charAt(0).toUpperCase()}
                </div>
                {tenant.name}
                {tenant.id === active.id && (
                  <span className="ml-auto text-xs text-primary">current</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { start(); router.push("/admin/onboarding"); }}>
              <Plus className="size-4" />
              New site
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu({
  email,
  isPlatformAdmin,
  flagshipUrl,
  signOutAction,
}: {
  email: string;
  isPlatformAdmin: boolean;
  flagshipUrl: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {email.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm">{email}</span>
                {isPlatformAdmin && (
                  <span className="truncate text-xs text-primary">Platform admin</span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56" align="start" side="top">
            {isPlatformAdmin && (
              <DropdownMenuItem asChild>
                <a href={flagshipUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  LUME flagship site
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                void signOutAction();
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ShellHeader({
  tenants,
  activeTenant,
  notifications,
  isPlatformAdmin,
}: {
  tenants: ShellTenant[];
  activeTenant: ShellTenant | null;
  notifications: ShellNotification[];
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const currentTheme = resolvedTheme === "light" ? "light" : "dark";

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const crumbs = buildCrumbs(pathname, activeTenant);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={crumb.href ?? crumb.label}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        <NotificationMenu
          tenant={activeTenant}
          notifications={
            activeTenant
              ? notifications.filter((notification) => notification.tenant_id === activeTenant.id)
              : []
          }
        />
        <ConciergeRobotToggle />
        <AnimatedThemeToggler
          theme={currentTheme}
          onThemeChange={setTheme}
          variant="circle"
          duration={350}
          className="inline-flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => setCommandOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </Button>
      </div>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        tenants={tenants}
        isPlatformAdmin={isPlatformAdmin}
      />
    </header>
  );
}

const NOTIFICATION_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function NotificationMenu({
  tenant,
  notifications,
}: {
  tenant: ShellTenant | null;
  notifications: ShellNotification[];
}) {
  const router = useRouter();
  const { start } = useNavLoader();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const unreadCount = tenant?.unreadCount ?? 0;

  const visitNotification = (notification: ShellNotification) => {
    if (!tenant) return;
    setError(null);
    startTransition(async () => {
      if (!notification.read_at) {
        const result = await markAdminNotificationRead(tenant.id, notification.id);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      if (notification.link?.startsWith("/admin/")) { start(); router.push(notification.link); }
      router.refresh();
    });
  };

  const markAllRead = () => {
    if (!tenant || unreadCount === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await markAllAdminNotificationsRead(tenant.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="relative text-muted-foreground"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
          disabled={!tenant}
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div>
            <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
            <p className="text-xs text-muted-foreground">
              {unreadCount ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={pending}
              onClick={markAllRead}
            >
              <CheckCheck aria-hidden="true" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {error && (
          <p role="alert" className="px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto p-1">
            {notifications.slice(0, 20).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="items-start gap-2 p-2"
                disabled={pending}
                onSelect={() => visitNotification(notification)}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    notification.read_at ? "bg-muted-foreground/25" : "bg-primary"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-normal leading-snug">{notification.body}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {NOTIFICATION_DATE_FORMATTER.format(new Date(notification.created_at))} UTC
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function buildCrumbs(pathname: string, activeTenant: ShellTenant | null) {
  const crumbs: Array<{ label: string; href?: string }> = [{ label: "Admin", href: "/admin" }];
  const parts = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return crumbs;

  if (parts[0] === "platform") {
    crumbs.push({ label: "Platform" });
    return crumbs;
  }
  if (parts[0] === "onboarding") {
    crumbs.push({ label: "Create your site" });
    return crumbs;
  }
  if (activeTenant && parts[0] === activeTenant.slug) {
    crumbs.push(
      parts.length === 1
        ? { label: activeTenant.name }
        : { label: activeTenant.name, href: `/admin/${activeTenant.slug}` }
    );
    if (parts[1]) {
      const section = NAV_LEAVES.find((s) => s.slug === parts[1]);
      const label = section?.label ?? parts[1];
      crumbs.push(
        parts.length === 2
          ? { label }
          : { label, href: `/admin/${activeTenant.slug}/${parts[1]}` }
      );
      if (parts[2]) crumbs.push({ label: parts[2] === "new" ? "New" : parts[2] === "import" ? "Import" : "Detail" });
    }
  }
  return crumbs;
}

function CommandPalette({
  open,
  onOpenChange,
  tenants,
  isPlatformAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: ShellTenant[];
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const { start } = useNavLoader();
  const go = (href: string) => {
    onOpenChange(false);
    start();
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Jump anywhere">
      <CommandInput placeholder="Go to…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {tenants.map((tenant) => (
          <CommandGroup key={tenant.id} heading={tenant.name}>
            {NAV_LEAVES.map((section) => (
              <CommandItem
                key={`${tenant.slug}-${section.label}`}
                value={`${tenant.name} ${section.label}`}
                onSelect={() =>
                  go(section.slug ? `/admin/${tenant.slug}/${section.slug}` : `/admin/${tenant.slug}`)
                }
              >
                <section.icon className="size-4" />
                {section.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {isPlatformAdmin && (
            <CommandItem onSelect={() => go("/admin/platform")}>
              <Building2 className="size-4" />
              Platform overview
            </CommandItem>
          )}
          <CommandItem onSelect={() => go("/admin/onboarding")}>
            <Plus className="size-4" />
            Create a new site
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
