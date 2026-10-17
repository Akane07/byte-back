/** Экранирует спецсимволы, чтобы поиск «C++» не ломал регулярное выражение. */
export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
