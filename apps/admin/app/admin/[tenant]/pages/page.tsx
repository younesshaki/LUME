import Link from "next/link";
import { notFound } from "next/navigation";
import { listPages } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function PagesListPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const pages = await listPages(supabase, tenant.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pages</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Edit draft page content and publish changes for {tenant.name}.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Page</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Slug</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pages.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-neutral-500">
                  No pages found for this tenant.
                </td>
              </tr>
            )}
            {pages.map((page) => (
              <tr
                key={page.id}
                className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{page.title || page.slug}</span>
                    {page.isReserved && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        Reserved
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs text-neutral-500">/{page.slug}</code>
                </td>
                <td className="px-4 py-3 text-neutral-500">{pageStatus(page)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/${tenant.slug}/pages/${page.id}`}
                    className="text-xs font-medium text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pageStatus(page: {
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
}): string {
  if (page.draftRevisionId && page.publishedRevisionId) return "Published with draft";
  if (page.draftRevisionId) return "Draft only";
  if (page.publishedRevisionId) return "Published";
  return "Empty";
}
