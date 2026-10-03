import Link from "next/link";
import { Zap } from "lucide-react";
import { STORE_NAME } from "@/lib/site";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label={`${STORE_NAME} home`}>
      <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
        <Zap className="size-4" strokeWidth={2.5} />
      </span>
      <span className="text-lg">{STORE_NAME}</span>
    </Link>
  );
}
