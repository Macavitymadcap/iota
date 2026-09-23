/** Polls until the predicate holds; notifications arrive asynchronously, so tests need to wait. */
export async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await Bun.sleep(10);
  }
}