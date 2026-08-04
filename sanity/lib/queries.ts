import { defineQuery } from "next-sanity";

// Exclude drafts; only posts with a slug; newest first.
export const POSTS_QUERY = defineQuery(`
  *[_type == "post" && !(_id in path("drafts.**")) && defined(slug.current)]
    | order(publishedAt desc) {
      _id,
      title,
      "slug": slug.current,
      excerpt,
      publishedAt,
      coverImage,
      author
    }
`);

export const POST_QUERY = defineQuery(`
  *[_type == "post" && slug.current == $slug && !(_id in path("drafts.**"))][0] {
    _id,
    title,
    "slug": slug.current,
    excerpt,
    publishedAt,
    coverImage,
    author,
    body,
    tags,
    seo {
      metaTitle,
      metaDescription
    }
  }
`);

export const SLUGS_QUERY = defineQuery(`
  *[_type == "post" && defined(slug.current) && !(_id in path("drafts.**"))]{
    "slug": slug.current,
    _updatedAt,
    publishedAt
  }
`);
