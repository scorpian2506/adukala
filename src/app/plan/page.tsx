import { PlanView } from "@/components/PlanView";
import { ClientOnly } from "@/components/States";

export default function PlanPage() {
  return (
    <ClientOnly>
      <PlanView />
    </ClientOnly>
  );
}
