import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listMyOrders } from "@/lib/orders/queries";
import { formatOrderNumber } from "@/lib/orders/status";
import { formatPrice } from "@/lib/money";
import { PasswordUpdatedToast, ProfileForm } from "@/components/account/profile-form";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const [{ password }, orders] = await Promise.all([searchParams, listMyOrders(user.id)]);
  const recent = orders.slice(0, 3);
  const memberSince = new Date(user.profile.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="space-y-10">
      {password === "updated" && <PasswordUpdatedToast />}
      <section className="rounded-2xl border bg-card p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Profile</h2>
            <p className="text-sm text-muted-foreground">
              Member since {memberSince}
              {user.profile.role === "admin" && " · Administrator"}
            </p>
          </div>
          <form action={signOut}>
            <Button variant="outline" type="submit">
              Sign out
            </Button>
          </form>
        </div>
        <ProfileForm fullName={user.profile.full_name ?? ""} email={user.email} />
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent orders</h2>
          <Link href="/account/orders" className="text-sm font-medium hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t placed any orders yet.{" "}
            <Link href="/products" className="font-medium text-foreground underline underline-offset-4">
              Browse products
            </Link>
          </p>
        ) : (
          <ul className="divide-y">
            {recent.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link href={`/account/orders/${o.id}`} className="font-medium hover:underline">
                  {formatOrderNumber(o.order_number)}
                </Link>
                <OrderStatusBadge status={o.status} />
                <span className="tabular-nums">{formatPrice(o.total_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
