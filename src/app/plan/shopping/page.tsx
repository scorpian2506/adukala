import { Suspense } from "react";
import { ShoppingView } from "@/components/ShoppingView";
import { ClientOnly, Loading } from "@/components/States";

export default function ShoppingPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ClientOnly>
        <ShoppingView />
      </ClientOnly>
    </Suspense>
  );
}
