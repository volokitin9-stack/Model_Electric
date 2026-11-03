import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredApiKey, setStoredApiKey } from "@/lib/api";

type Status = "checking" | "unlocked" | "locked";

async function checkKey(key: string | null): Promise<boolean> {
  const res = await fetch("/api/auth/check", {
    headers: key ? { "x-api-key": key } : {},
  });
  return res.ok;
}

// Если на сервере задан API_KEY, спрашивает его один раз и хранит в
// localStorage этого браузера; если сервер не настроен на ключ (локальная
// разработка) — ничего не спрашивает и сразу пропускает дальше.
export function ApiKeyGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    checkKey(getStoredApiKey()).then((ok) => setStatus(ok ? "unlocked" : "locked"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const ok = await checkKey(input.trim());
    setPending(false);
    if (!ok) {
      setError("Неверный ключ доступа");
      return;
    }
    setStoredApiKey(input.trim());
    setStatus("unlocked");
  }

  if (status === "checking") return null;

  if (status === "locked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" /> Нужен ключ доступа
          </div>
          <Input
            type="password"
            autoFocus
            placeholder="Ключ доступа"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !input.trim()}>
            Войти
          </Button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
