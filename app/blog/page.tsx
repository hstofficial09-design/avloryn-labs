import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Subscribe } from "@/components/blog/subscribe";
import { sanityFetch } from "@/sanity/lib/fetch";
import { POSTS_QUERY } from "@/sanity/lib/queries";
import { urlForImage } from "@/sanity/lib/image";
import type { PostCard } from "@/sanity/lib/types";
import { formatDate } from "@/lib/date";
import { SITE_URL, ORG_ID, WEBSITE_ID, breadcrumbLd } from "@/lib/seo";

export const revalidate = 60; // ISR — new posts appear within ~1 min, no redeploy

const blogLd = {
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": `${SITE_URL}/blog#blog`,
  url: `${SITE_URL}/blog`,
  name: "Journal — Avloryn Labs",
  description:
    "Notes from Avloryn Labs on building intelligent software that works the way people do.",
  isPartOf: { "@id": WEBSITE_ID },
  publisher: { "@id": ORG_ID },
  inLanguage: "en",
};

const blogBreadcrumb = breadcrumbLd([{ name: "Journal", path: "/blog" }]);

export const metadata: Metadata = {
  title: "Journal",
  description:
    "Notes from Avloryn Labs on building intelligent software that works the way people do.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Journal · Avloryn Labs",
    description: "Notes on building intelligent software that works the way people do.",
    url: "/blog",
  },
};

export default async function BlogIndexPage() {
  const posts = (await sanityFetch<PostCard[]>(POSTS_QUERY, {}, [])) ?? [];

  return (
    <>
      <Navbar />
      <main className="pt-32 sm:pt-40">
        <section className="container pb-10">
          <p className="section-label">Journal</p>
          <h1 className="mt-4 max-w-3xl text-display font-[560] tracking-[-0.03em] text-balance">
            Notes on building software for people.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-[1.05rem] leading-relaxed text-muted-foreground">
            Occasional writing on craft, product, and the long road of building
            intelligent tools — from the team at Avloryn Labs.
          </p>
        </section>

        <section className="container pb-24">
          {posts.length === 0 ? (
            <div className="card-lux mt-6 rounded-3xl p-12 text-center">
              <h2 className="text-xl font-[540]">Writing, soon.</h2>
              <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                Our first pieces are on the way. Subscribe below and they&apos;ll land
                in your inbox.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <a
                  key={post._id}
                  href={`/blog/${post.slug}`}
                  className="card-lux card-lux-hover group flex flex-col overflow-hidden rounded-3xl"
                >
                  <div className="aspect-[16/10] w-full overflow-hidden bg-muted">
                    {post.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urlForImage(post.coverImage).width(800).height(500).fit("crop").auto("format").url()}
                        alt={post.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 ease-premium group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-faint">
                        <span className="font-serif text-2xl italic">Avloryn</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <span className="text-[0.8rem] text-faint">{formatDate(post.publishedAt)}</span>
                    <h2 className="mt-2 text-[1.25rem] font-[540] leading-snug tracking-[-0.01em]">
                      {post.title}
                    </h2>
                    {post.excerpt ? (
                      <p className="mt-2 line-clamp-3 text-[0.95rem] leading-relaxed text-muted-foreground">
                        {post.excerpt}
                      </p>
                    ) : null}
                    <span className="mt-5 inline-flex items-center gap-1.5 text-[0.88rem] font-[480] text-foreground">
                      Read
                      <span aria-hidden="true" className="transition-transform duration-300 ease-premium group-hover:translate-x-1">
                        →
                      </span>
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}

          <div className="mt-16">
            <Subscribe />
          </div>
        </section>
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogBreadcrumb) }}
      />
    </>
  );
}
