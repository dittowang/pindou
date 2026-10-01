/** Tiny typed event emitter. */
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<(p: never) => void>>()
  on<K extends keyof E>(k: K, fn: (p: E[K]) => void): () => void {
    let s = this.map.get(k)
    if (!s) this.map.set(k, (s = new Set()))
    s.add(fn as (p: never) => void)
    return () => s!.delete(fn as (p: never) => void)
  }
  emit<K extends keyof E>(k: K, p: E[K]) {
    this.map.get(k)?.forEach((fn) => (fn as (p: E[K]) => void)(p))
  }
}
