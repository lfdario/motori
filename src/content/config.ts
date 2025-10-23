import { z, defineCollection } from "astro:content";
const common = { title: z.string(), description: z.string(), cover: z.string().optional(), categories: z.array(z.string()).default([]), tags: z.array(z.string()).default([]), author: z.string().default("Redazione"), pubDate: z.string(), };
const news = defineCollection({ type: "content", schema: z.object(common) });
const tests = defineCollection({ type: "content", schema: z.object(common).extend({ score: z.number().min(0).max(10).default(7.5) }) });
const guides = defineCollection({ type: "content", schema: z.object(common) });
export const collections = { news, tests, guides };
