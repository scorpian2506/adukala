import { Suspense } from "react";
import { SearchView } from "@/components/SearchView";
import { Loading } from "@/components/States";

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchView />
    </Suspense>
  );
}
