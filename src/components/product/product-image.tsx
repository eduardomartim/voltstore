import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductImage({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-xl bg-muted", className)}>
      {src ? (
        <Image
          src={`${src}${src.includes("?") ? "&" : "?"}auto=format&fit=crop&w=1200&q=80`}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid h-full place-items-center text-muted-foreground">
          <ImageOff className="size-8" aria-hidden />
          <span className="sr-only">No image available</span>
        </div>
      )}
    </div>
  );
}
