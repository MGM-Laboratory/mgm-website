import { ArticleMissing } from "@/components/articles/detail/article-missing";

/**
 * An article that doesn't exist (a mistyped or retired link, a deleted
 * article): still inside the library world, which dresses itself for an
 * article page, with the way back to the archive.
 */
export default function ArticleNotFound() {
  return <ArticleMissing />;
}
