import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Subscribe } from "@/components/blog/subscribe";
import { PortableTextBody } from "@/components/blog/portable-text";
import { sanityFetch } from "@/sanity/lib/fetch";
import { POST_QUERY, SLUGS_QUERY } from "@/sanity/lib/queries";
import { urlForImage } from "@/sanity/lib/image";
import type { Post } from "@/sanity/lib/types";
import { formatDate } from "@/lib/date";
import { SITE_URL, ORG_ID, breadcrumbLd } from "@/lib/seo";

export const revalidate = 60; // ISR

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = (await sanityFetch<{ slug: string }[]>(SLUGS_QUERY, {}, [])) ?? [];
  return slugs.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await sanityFetch<Post>(POST_QUERY, { slug });
  if (!post) return { title: "Post not found" };

  const title = post.seo?.metaTitle || post.title;
  const description = post.seo?.metaDescription || post.excerpt || undefined;
  const ogImage = post.coverImage
    ? urlForImage(post.coverImage).width(1200).height(630).fit("crop").url()
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/blog/${slug}`,
      publishedTime: post.publishedAt || undefined,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description || "",
    },
  };
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const post = await sanityFetch<Post>(POST_QUERY, { slug });
  if (!post) notFound();

  const coverUrl = post.coverImage
    ? urlForImage(post.coverImage).width(1600).fit("max").auto("format").url()
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${SITE_URL}/blog/${slug}#article`,
    headline: post.title,
    datePublished: post.publishedAt || undefined,
    dateModified: post.publishedAt || undefined,
    description: post.excerpt || undefined,
    image: post.coverImage
      ? urlForImage(post.coverImage).width(1200).height(630).url()
      : undefined,
    // Named person for EEAT when we have one; otherwise the brand entity.
    author: post.author
      ? { "@type": "Person", name: post.author }
      : { "@id": ORG_ID },
    // Publisher carries an inline logo (required for Article rich results) AND
    // links to the site-wide Organization entity via its stable @id.
    publisher: {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "Avloryn Labs",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/avloryn-mark.png` },
    },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    inLanguage: "en",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${slug}` },
  };

  const breadcrumb = breadcrumbLd([
    { name: "Journal", path: "/blog" },
    { name: post.title, path: `/blog/${slug}` },
  ]);

  return (
    <>
      <Navbar />
      <main className="pt-32 sm:pt-40">
        <article className="container max-w-3xl pb-24">
          <a
            href="/blog"
            className="inline-flex items-center gap-1.5 text-[0.9rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span aria-hidden="true">←</span> Journal
          </a>

          <header className="mt-6">
            {post.tags && post.tags.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {post.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-muted px-3 py-1 text-[0.72rem] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <h1 className="text-display font-[560] tracking-[-0.03em] text-balance">
              {post.title}
            </h1>
            <div className="mt-5 flex items-center gap-3 text-[0.9rem] text-faint">
              <span>{formatDate(post.publishedAt)}</span>
              {post.author ? (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border-strong" />
                  <span>{post.author}</span>
                </>
              ) : null}
            </div>
          </header>

          {coverUrl ? (
            <figure className="mt-10 overflow-hidden rounded-3xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt={post.title} className="w-full" />
            </figure>
          ) : null}

          <div className="mt-10">
            <PortableTextBody value={post.body ?? []} />
          </div>

          <div className="mt-16">
            <Subscribe />
          </div>
        </article>
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
