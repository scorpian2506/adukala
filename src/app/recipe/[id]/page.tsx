import { Suspense } from "react";
import { RecipeView } from "@/components/RecipeView";
import { Loading } from "@/components/States";

export default function RecipePage({ params }: PageProps<"/recipe/[id]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ id }) => <RecipeView id={id} />)}</Suspense>;
}
