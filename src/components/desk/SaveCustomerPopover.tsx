import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { saveDeal, type DealDraft, type SavedDeal } from "@/lib/saved-deals";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The saved customer on the desk, if any — switches the button to "Update Deal". */
  activeDeal: SavedDeal | null;
  buildDraft: (meta: { customerName: string; customerPhone: string; notes: string }) => DealDraft;
  onSaved: (deal: SavedDeal) => void;
  /** Called instead of opening when signed out. */
  onNeedSignIn: () => void;
  signedIn: boolean;
}

/** Header "+ Save Customer" / "Update Deal" button with a quick name, phone and notes form. */
export function SaveCustomerPopover({ open, onOpenChange, activeDeal, buildDraft, onSaved, onNeedSignIn, signedIn }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(activeDeal?.customerName ?? "");
    setPhone(activeDeal?.customerPhone ?? "");
    setNotes(activeDeal?.notes ?? "");
  }, [open, activeDeal]);

  const save = useMutation({
    mutationFn: (asNew: boolean) => saveDeal(buildDraft({ customerName: name, customerPhone: phone, notes }), asNew ? undefined : activeDeal?.id),
    onSuccess: (saved, asNew) => {
      void qc.invalidateQueries({ queryKey: ["saved_deals"] });
      onSaved(saved);
      onOpenChange(false);
      toast.success(asNew || !activeDeal ? `Saved ${saved.customerName}` : `Updated ${saved.customerName}`);
    },
    onError: () => toast.error("Couldn't save the deal. Check the connection and try again."),
  });

  const updating = !!activeDeal;

  return (
    <Popover open={open} onOpenChange={(o) => (o && !signedIn ? onNeedSignIn() : onOpenChange(o))}>
      <PopoverTrigger asChild>
        <Button size="sm" className="h-10" aria-label={updating ? "Update deal" : "Save customer"}>
          {updating ? <RefreshCw className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span className="hidden md:inline">{updating ? "Update Deal" : "Save Customer"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-4">
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate(false);
          }}
        >
          <div>
            <div className="text-sm font-semibold">{updating ? "Update this customer's deal" : "Save this customer"}</div>
            <p className="text-xs text-muted-foreground">Saves the unit, deal numbers and their current car.</p>
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Smith - 2018 Equinox Trade"
            required
            autoFocus
            className="h-11 text-base"
            aria-label="Customer name"
          />
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
          <div className={cn("grid gap-2", updating ? "grid-cols-2" : "grid-cols-1")}>
            <Button type="submit" className="h-11" disabled={!name.trim() || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {updating ? "Update Deal" : "Save Customer"}
            </Button>
            {updating && (
              <Button type="button" variant="secondary" className="h-11" disabled={!name.trim() || save.isPending} onClick={() => save.mutate(true)}>
                Save as new
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
