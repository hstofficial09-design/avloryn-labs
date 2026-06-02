import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId } from "@/sanity/env";

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  // CDN for fast public reads; pages set their own `revalidate` for freshness.
  useCdn: true,
});
