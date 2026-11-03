import { useEffect, useState } from "react";

// Персистентность пользовательских настроек UI (ширина/видимость
// колонок, размер страницы) — не основных данных проекта, которые
// живут в базе на сервере.
export function useLocalStorageState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // игнорируем недоступность localStorage (приватный режим и т.п.)
    }
  }, [key, state]);

  return [state, setState];
}
