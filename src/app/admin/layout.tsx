import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { isAdmin, requireUser } from "@/lib/auth/session";
import { AdminNav } from "@/components/admin/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: { default: "Admin", template: "%s · Admin · Voltline" } };

/**
 * UI gate for the admin area. It is not the security boundary: every admin
 * mutation re-checks the role server-side and RLS enforces it in Postgres.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser("/admin");

  if (!isAdmin(user)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <EmptyState icon={ShieldAlert} title="Access denied" description="You need an administrator account to view this page.">
          <Button asChild variant="outline">
            <Link href="/">Back to store</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight">Store management</h1>
        </div>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
