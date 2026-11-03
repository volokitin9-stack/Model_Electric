import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { CURRENCIES } from "@/lib/statuses";
import type { Supplier } from "@/lib/types";

type FormState = {
  code: string; name: string; country: string; contactPerson: string;
  phone: string; email: string; messenger: string; website: string;
  defaultCurrency: string; comment: string;
};
function toForm(s?: Supplier | null): FormState {
  return {
    code: s?.code ?? "", name: s?.name ?? "", country: s?.country ?? "", contactPerson: s?.contactPerson ?? "",
    phone: s?.phone ?? "", email: s?.email ?? "", messenger: s?.messenger ?? "", website: s?.website ?? "",
    defaultCurrency: s?.defaultCurrency ?? "RUB", comment: s?.comment ?? "",
  };
}

export function SupplierFormDialog({
  open, onOpenChange, supplier, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplier?: Supplier | null;
  onCreated?: (s: Supplier) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(toForm(supplier));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(supplier));
      setError(null);
    }
  }, [open, supplier]);

  const createMutation = useMutation({
    mutationFn: () => api.createSupplier(normalize(form)),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      onCreated?.(s);
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: () => api.updateSupplier(supplier!.id, normalize(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["supplier", supplier?.id] });
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  function normalize(f: FormState) {
    return {
      code: f.code.trim(), name: f.name.trim(),
      country: f.country.trim() || null, contactPerson: f.contactPerson.trim() || null,
      phone: f.phone.trim() || null, email: f.email.trim() || null,
      messenger: f.messenger.trim() || null, website: f.website.trim() || null,
      defaultCurrency: f.defaultCurrency, comment: f.comment.trim() || null,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setError("Код и название обязательны");
      return;
    }
    if (supplier) updateMutation.mutate();
    else createMutation.mutate();
  }

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? "Редактирование поставщика" : "Новый поставщик"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Код поставщика</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SUP01" autoFocus disabled={!!supplier} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Название</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="country">Страна</Label>
              <Input id="country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact">Контактное лицо</Label>
              <Input id="contact" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="messenger">Мессенджер</Label>
              <Input id="messenger" value={form.messenger} onChange={(e) => setForm({ ...form, messenger: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="website">Сайт</Label>
              <Input id="website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Валюта по умолчанию</Label>
              <Select value={form.defaultCurrency} onValueChange={(v) => setForm({ ...form, defaultCurrency: v })}>
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
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="comment">Комментарий</Label>
              <Input id="comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {supplier ? "Сохранить" : "Создать поставщика"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
