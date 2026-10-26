import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Loader2, LogIn, LogOut, Phone, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { deleteDeal, listSavedDeals, saveDeal, type DealDraft, type SavedDeal } from "@/lib/saved-deals";
import { cn } from "@/lib/utils";

import { money } from "./fields";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The saved deal currently on the desk, if one was opened or saved. */
  activeDeal: SavedDeal | null;
  /** Desk state to save, with the customer fields from the form. */
  buildDraft: (meta: { customerName: string; customerPhone: string; notes: string }) => DealDraft;
  onLoad: (deal: SavedDeal) => void;
  onSaved: (deal: SavedDeal | null) => void;
}

export function SavedDealsPanel({ open, onOpenChange, activeDeal, buildDraft, onLoad, onSaved }: Props) {
  const isMobile = useIsMobile();
  const { user, ready, signOut } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const key = ["saved_deals", user?.id ?? "none"];
  const deals = useQuery({ queryKey: key, queryFn: listSavedDeals, enabled: !!user && open });

  useEffect(() => {
    if (!open) return;
    setName(activeDeal?.customerName ?? "");
    setPhone(activeDeal?.customerPhone ?? "");
    setNotes(activeDeal?.notes ?? "");
  }, [open, activeDeal]);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const save = useMutation({
    mutationFn: (asNew: boolean) =>
      saveDeal(buildDraft({ customerName: name, customerPhone: phone, notes }), asNew ? undefined : activeDeal?.id),
    onSuccess: (saved, asNew) => {
      void qc.invalidateQueries({ queryKey: ["saved_deals"] });
      onSaved(saved);
      toast.success(asNew || !activeDeal ? `Saved ${saved.customerName}` : `Updated ${saved.customerName}`);
    },
    onError: () => toast.error("Couldn't save the deal. Check the connection and try again."),
  });

  const remove = useMutation({
    mutationFn: deleteDeal,
    onSuccess: (_r, id) => {
      void qc.invalidateQueries({ queryKey: ["saved_deals"] });
      if (activeDeal?.id === id) onSaved(null);
      toast("Deal deleted");
    },
    onError: () => toast.error("Couldn't delete the deal."),
  });

  const filtered = useMemo(() => {
    const list = deals.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) =>
      [d.customerName, d.customerPhone, d.proposedStock, d.vehicle?.makeModel, d.notes].join(" ").toLowerCase().includes(q),
    );
  }, [deals.data, filter]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 p-0", isMobile ? "h-[88dvh] rounded-t-3xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="border-b border-border px-5 pb-3 pt-5 text-left">
          <SheetTitle>Saved deals</SheetTitle>
          <SheetDescription className="flex items-center justify-between gap-2">
            <span className="truncate">{user ? user.email : "Your customers and deal structures"}</span>
            {user && (
              <button type="button" onClick={() => void signOut()} className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            )}
          </SheetDescription>
        </SheetHeader>

        {!ready ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !user ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <FolderOpen className="h-10 w-10 text-primary" />
            <p className="text-sm text-muted-foreground">
              Sign in to save customers and deal structures to your account and open them again on any phone.
            </p>
            <Button asChild className="h-11 w-full max-w-xs">
              <Link to="/auth">
                <LogIn className="h-4 w-4" /> Sign in to save deals
              </Link>
            </Button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <form
              className="mt-4 space-y-2.5 rounded-2xl border border-border bg-background/40 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) save.mutate(false);
              }}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {activeDeal ? "Deal on the desk" : "Save the deal on the desk"}
              </div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" required className="h-11 text-base" aria-label="Customer name" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                type="tel"
                inputMode="tel"
                className="h-11 text-base"
                aria-label="Customer phone"
              />
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="text-base" aria-label="Notes" />
              <div className={cn("grid gap-2", activeDeal ? "grid-cols-2" : "grid-cols-1")}>
                <Button type="submit" className="h-11" disabled={!name.trim() || save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {activeDeal ? "Update" : "Save deal"}
                </Button>
                {activeDeal && (
                  <Button type="button" variant="secondary" className="h-11" disabled={!name.trim() || save.isPending} onClick={() => save.mutate(true)}>
                    Save as new
                  </Button>
                )}
              </div>
            </form>

            <div className="relative mt-5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search name, phone, stock #" className="h-11 pl-9 text-base" />
            </div>

            <ul className="mt-3 space-y-2">
              {deals.isLoading && (
                <li className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </li>
              )}
              {deals.isError && <li className="py-6 text-center text-sm text-muted-foreground">Couldn't load your deals.</li>}
              {filtered.map((d) => (
                <li key={d.id} className={cn("flex items-stretch gap-2 rounded-xl border p-1", d.id === activeDeal?.id ? "border-primary bg-primary/10" : "border-border bg-background/40")}>
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-lg p-2 text-left active:bg-accent"
                    onClick={() => {
                      onLoad(d);
                      onOpenChange(false);
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{d.customerName}</span>
                      <span className="num shrink-0 text-[11px] text-muted-foreground">{new Date(d.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {d.vehicle ? `#${d.vehicle.stock} · ${d.vehicle.year} ${d.vehicle.makeModel}` : d.proposedStock ? `#${d.proposedStock}` : "No vehicle"}
                    </div>
                    <div className="num mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      {d.deal && (
                        <span>
                          {money(d.deal.price)} · {d.deal.term} mo · {d.deal.apr}%
                        </span>
                      )}
                      {d.customerPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {d.customerPhone}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={confirmDelete === d.id ? `Confirm delete ${d.customerName}` : `Delete ${d.customerName}`}
                    className={cn(
                      "flex w-12 shrink-0 flex-col items-center justify-center rounded-lg text-[10px]",
                      confirmDelete === d.id ? "bg-destructive/20 text-destructive" : "text-muted-foreground active:bg-accent",
                    )}
                    onClick={() => (confirmDelete === d.id ? remove.mutate(d.id) : setConfirmDelete(d.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                    {confirmDelete === d.id && "Sure?"}
                  </button>
                </li>
              ))}
              {deals.isSuccess && !filtered.length && (
                <li className="py-8 text-center text-sm text-muted-foreground">{filter ? "No matches." : "No saved deals yet."}</li>
              )}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
