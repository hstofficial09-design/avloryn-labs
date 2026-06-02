import type { ImageSource } from "@/sanity/lib/image";
import type { PortableTextBlock } from "@portabletext/types";

export interface PostCard {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  coverImage?: ImageSource | null;
  author?: string | null;
}

export interface Post extends PostCard {
  body?: PortableTextBlock[] | null;
  tags?: string[] | null;
  seo?: {
    metaTitle?: string | null;
    metaDescription?: string | null;
  } | null;
}
