import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { listSavedDeals } from "@/lib/saved-deals";

/** The signed-in salesperson's saved customers (shared by the header badge and the drawer). */
export function useSavedDeals() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["saved_deals", user?.id ?? "none"], queryFn: listSavedDeals, enabled: !!user });
}
