import { createImageUrlBuilder } from "@sanity/image-url";
import { client } from "@/sanity/lib/client";

const builder = createImageUrlBuilder(client);

// Derive the accepted source type from the builder itself — avoids depending
// on an internal type path that moves between @sanity/image-url versions.
export type ImageSource = Parameters<typeof builder.image>[0];

export function urlForImage(source: ImageSource) {
  return builder.image(source);
}
