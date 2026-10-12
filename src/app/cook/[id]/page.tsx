import { Suspense } from "react";
import { CookMode } from "@/components/CookMode";
import { Loading } from "@/components/States";

export default function CookPage({ params }: PageProps<"/cook/[id]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ id }) => <CookMode id={id} />)}</Suspense>;
}
