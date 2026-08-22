export class BudgetGuard {
  private spent: number;

  constructor(private opts: { estimatedUSD?: number; budgetUSD?: number; overrunFactor?: number } = {}) {
    this.spent = 0;
  }

  maxAllowedUSD(): number | null {
    const factor = this.opts.overrunFactor ?? 1.5;
    const caps: number[] = [];
    if (this.opts.budgetUSD != null) caps.push(this.opts.budgetUSD);
    if (this.opts.estimatedUSD != null) caps.push(this.opts.estimatedUSD * factor);
    return caps.length ? Math.min(...caps) : null;
  }

  recordSpend(usd: number): void {
    this.spent += usd;
  }

  spentUSD(): number {
    return this.spent;
  }

  /** Call BEFORE every paid API request. */
  assertWithin(projectedCostUSD: number): void {
    const max = this.maxAllowedUSD();
    if (max != null && this.spent + projectedCostUSD > max) {
      throw new Error(
        `BUDGET_CIRCUIT_BREAKER: spent $${this.spent.toFixed(2)} + projected $${projectedCostUSD.toFixed(2)} exceeds cap $${max.toFixed(2)}`
      );
    }
  }
}