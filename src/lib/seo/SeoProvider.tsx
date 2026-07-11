import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PublishedPage } from "@lume/types";
import { publicTenantSlug, resolvePublicTenant } from "@/lib/publicTenant";
import { useSeo, type SeoValues } from "./useSeo";

type PageSeoRegistration = {
  pathname: string;
  values: SeoValues;
};

type RegisteredPageSeo = PageSeoRegistration & {
  token: symbol;
};

type SeoContextValue = {
  registerPageSeo: (registration: PageSeoRegistration) => () => void;
};

const SeoContext = createContext<SeoContextValue | null>(null);

type SeoProviderProps = {
  pathname: string;
  children: ReactNode;
  enabled?: boolean;
};

export function SeoProvider({ pathname, children, enabled = true }: SeoProviderProps) {
  if (!enabled) return <>{children}</>;
  return <ActiveSeoProvider pathname={pathname}>{children}</ActiveSeoProvider>;
}

function ActiveSeoProvider({ pathname, children }: Omit<SeoProviderProps, "enabled">) {
  const activeTokenRef = useRef<symbol | null>(null);
  const [tenantName, setTenantName] = useState<string>();
  const [registeredPage, setRegisteredPage] = useState<RegisteredPageSeo | null>(null);

  useEffect(() => {
    let cancelled = false;

    void resolvePublicTenant(publicTenantSlug).then((tenant) => {
      if (!cancelled) setTenantName(tenant?.name);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const registerPageSeo = useCallback((registration: PageSeoRegistration) => {
    const token = Symbol("page-seo");
    activeTokenRef.current = token;
    setRegisteredPage({ ...registration, token });

    return () => {
      if (activeTokenRef.current !== token) return;
      activeTokenRef.current = null;
      setRegisteredPage(null);
    };
  }, []);

  const activePage = registeredPage?.pathname === pathname ? registeredPage.values : undefined;

  useSeo({
    page: activePage,
    tenant: { title: tenantName },
    canonicalPath: pathname,
  });

  return <SeoContext.Provider value={{ registerPageSeo }}>{children}</SeoContext.Provider>;
}

/** Register metadata already returned with an existing published-page fetch. */
export function usePublishedPageSeo(page: PublishedPage | null): void {
  const context = useContext(SeoContext);
  const registerPageSeo = context?.registerPageSeo;
  const title = page?.seoMeta.title;
  const description = page?.seoMeta.description;
  const ogImage = page?.seoMeta.ogImage;
  const slug = page?.slug;

  useEffect(() => {
    if (!registerPageSeo || !slug) return;

    return registerPageSeo({
      pathname: `/${slug}`,
      values: { title, description, ogImage },
    });
  }, [description, ogImage, registerPageSeo, slug, title]);
}
