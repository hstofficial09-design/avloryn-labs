"use client";

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { apiVersion, dataset, projectId } from "@/sanity/env";
import { schema } from "@/sanity/schemaTypes";

/**
 * Sanity Studio config. Mounted in the app at /studio (see
 * app/studio/[[...tool]]/page.tsx). Hardev edits and publishes posts here.
 */
export default defineConfig({
  name: "avloryn",
  title: "Avloryn Studio",
  basePath: "/studio",
  projectId,
  dataset,
  schema,
  plugins: [
    structureTool(),
    visionTool({ defaultApiVersion: apiVersion }),
  ],
});
