import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
export async function GET(context) {
  const posts = (await getCollection("news"))
    .sort((a,b) => (b.data.pubDate).localeCompare(a.data.pubDate))
    .slice(0,20);
  return rss({
    title: "Motori • RSS",
    description: "Le ultime notizie dal mondo auto",
    site: context.site,
    items: posts.map(p => ({
      link: `/site-automation-pro/news/${p.slug}/`,
      title: p.data.title,
      pubDate: new Date(p.data.pubDate),
      description: p.data.description
    })),
  });
}