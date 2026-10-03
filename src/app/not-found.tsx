import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <EmptyState icon={SearchX} title="Page not found" description="The page or product you're looking for doesn't exist or is no longer available.">
        <Button asChild>
          <Link href="/products">Browse products</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
