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
  Bot,
  BookOpen,
  Building2,
  Car,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Moon,
  Palette,
  PanelTop,
  Plus,
  Search,
  Sun,
  Users,
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
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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

export type ShellTenant = {
  id: string;
  slug: string;
  name: string;
  role: string;
  siteUrl: string;
};

type AdminShellProps = {
  email: string;
  tenants: ShellTenant[];
  isPlatformAdmin: boolean;
  flagshipUrl: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
};

const SECTIONS = [
  { slug: "", label: "Overview", icon: LayoutDashboard },
  { slug: "website", label: "Website", icon: LayoutTemplate },
  { slug: "vehicles", label: "Vehicles", icon: Car },
  { slug: "leads", label: "Leads", icon: Inbox },
  { slug: "analytics", label: "Analytics", icon: BarChart3 },
  { slug: "pages", label: "Pages", icon: FileText },
  { slug: "navigation", label: "Navigation", icon: PanelTop },
  { slug: "assets", label: "Assets", icon: ImageIcon },
  { slug: "branding", label: "Branding", icon: Palette },
  { slug: "domains", label: "Domains", icon: Globe },
  { slug: "team", label: "Team", icon: Users },
  { slug: "persona", label: "Bot Persona", icon: Bot },
  { slug: "knowledge", label: "Knowledge", icon: BookOpen },
] as const;

function useActiveTenant(tenants: ShellTenant[], pathname: string): ShellTenant | null {
  const fromPath = pathname.match(/^\/admin\/([^/]+)/)?.[1];
  return tenants.find((tenant) => tenant.slug === fromPath) ?? tenants[0] ?? null;
}

export function AdminShell({
  email,
  tenants,
  isPlatformAdmin,
  flagshipUrl,
  signOutAction,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const activeTenant = useActiveTenant(tenants, pathname);

  return (
    // This shadcn sidebar version does not mount its own TooltipProvider;
    // the collapsed-rail tooltips crash without one.
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
        <ShellHeader tenants={tenants} activeTenant={activeTenant} isPlatformAdmin={isPlatformAdmin} />
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}

function TenantSwitcher({ tenants, active }: { tenants: ShellTenant[]; active: ShellTenant | null }) {
  const router = useRouter();

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
              <DropdownMenuItem key={tenant.id} onSelect={() => router.push(`/admin/${tenant.slug}`)}>
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
            <DropdownMenuItem onSelect={() => router.push("/admin/onboarding")}>
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
  const { resolvedTheme, setTheme } = useTheme();

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
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
              }}
            >
              {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
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
  isPlatformAdmin,
}: {
  tenants: ShellTenant[];
  activeTenant: ShellTenant | null;
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = React.useState(false);

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
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
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
      <div className="ml-auto">
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
      const section = SECTIONS.find((s) => s.slug === parts[1]);
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
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Jump anywhere">
      <CommandInput placeholder="Go to…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {tenants.map((tenant) => (
          <CommandGroup key={tenant.id} heading={tenant.name}>
            {SECTIONS.map((section) => (
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
