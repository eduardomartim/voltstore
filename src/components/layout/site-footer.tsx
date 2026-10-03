import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t bg-muted/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="space-y-3 md:col-span-2">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">
            Considered gear for focused work and play. Voltline is a portfolio project — products are fictional and
            payments run in Stripe test mode.
          </p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Shop</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/products">All products</Link></li>
            <li><Link className="hover:text-foreground" href="/products?category=keyboards">Keyboards</Link></li>
            <li><Link className="hover:text-foreground" href="/products?category=audio">Audio</Link></li>
            <li><Link className="hover:text-foreground" href="/products?category=monitors">Monitors</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Account</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/account">Profile</Link></li>
            <li><Link className="hover:text-foreground" href="/account/orders">Orders</Link></li>
            <li><Link className="hover:text-foreground" href="/cart">Cart</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Voltline. Demo store — no real orders are fulfilled.
        </p>
      </div>
    </footer>
  );
}
