import {
  PortableText,
  type PortableTextComponents,
} from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import { urlForImage } from "@/sanity/lib/image";

const components: PortableTextComponents = {
  types: {
    image: ({ value }) => {
      if (!value?.asset) return null;
      const url = urlForImage(value).width(1400).fit("max").auto("format").url();
      return (
        <figure className="my-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={value.alt || ""}
            loading="lazy"
            className="w-full rounded-2xl border border-border"
          />
          {value.alt ? (
            <figcaption className="mt-3 text-center text-[0.85rem] text-faint">
              {value.alt}
            </figcaption>
          ) : null}
        </figure>
      );
    },
  },
  marks: {
    link: ({ value, children }) => {
      const href: string = value?.href || "#";
      const external = /^https?:\/\//.test(href);
      return (
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {children}
        </a>
      );
    },
    code: ({ children }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">{children}</code>
    ),
  },
};

export function PortableTextBody({
  value,
}: {
  value: PortableTextBlock[];
}) {
  return (
    <div className="legal-prose">
      <PortableText value={value} components={components} />
    </div>
  );
}
