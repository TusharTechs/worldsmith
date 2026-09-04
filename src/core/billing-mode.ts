/**
 * Whether billing is pointed at Dodo's test environment.
 *
 * Test checkouts run end to end on purpose — the redirect, the webhook, its signature check and
 * the payment record all exercise the real path, which is the only way to know the live path
 * works. What they must never do is move credits: a balance nobody paid for makes the ledger
 * meaningless, and the ledger is the thing that decides whether a production may start.
 *
 * Defaults to test, so an unset or misspelled variable can never mint credits. Only the explicit
 * string "live" turns granting on.
 */
export function isTestBilling(): boolean {
  return (process.env.DODO_MODE ?? "test") !== "live";
}
