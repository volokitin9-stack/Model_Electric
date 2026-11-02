import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { AVAILABILITY_LABELS, AVAILABILITY_VALUES, CURRENCIES } from "@/lib/statuses";
import type { CrossReference } from "@/lib/types";

export function PriceEditDialog({
  crossReference,
  onOpenChange,
}: {
  crossReference: CrossReference | null;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [availability, setAvailability] = useState<string>("yes");
  const [moq, setMoq] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (crossReference) {
      setPrice(crossReference.currentPrice?.price ?? "");
      setCurrency(crossReference.currentPrice?.currency ?? "RUB");
      setAvailability(crossReference.currentPrice?.availability ?? "yes");
      setMoq(crossReference.currentPrice?.minimumOrderQuantity != null ? String(crossReference.currentPrice.minimumOrderQuantity) : "");
      setLeadTimeDays(crossReference.currentPrice?.leadTimeDays != null ? String(crossReference.currentPrice.leadTimeDays) : "");
      setError(null);
    }
  }, [crossReference]);

  const mutation = useMutation({
    mutationFn: () =>
      api.addPrice(crossReference!.id, {
        price: Number(price),
        currency,
        availability,
        minimumOrderQuantity: moq ? Number(moq) : null,
        leadTimeDays: leadTimeDays ? Number(leadTimeDays) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cross-references"] });
      qc.invalidateQueries({ queryKey: ["supplier"] });
      qc.invalidateQueries({ queryKey: ["price-history"] });
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(price);
    if (!price || Number.isNaN(n) || n < 0) {
      setError("Укажите корректную цену");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={Boolean(crossReference)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Цена: {crossReference?.supplierArticle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price">Цена</Label>
              <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Валюта</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Наличие</Label>
              <Select value={availability} onValueChange={setAvailability}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {AVAILABILITY_LABELS[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="moq">Мин. партия</Label>
              <Input id="moq" type="number" min="0" value={moq} onChange={(e) => setMoq(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leadTime">Срок поставки, дн.</Label>
              <Input id="leadTime" type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
