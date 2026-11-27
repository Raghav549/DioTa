/**
 * Payout provider boundary.
 *
 * DioTa never fakes a payout. A real UPI / bank-transfer provider adapter must implement
 * `PayoutProvider` and be returned from `getProvider()`. Until one is configured, payment
 * verification and withdrawals report their real status ("not available yet").
 */
export interface PayoutProvider {
  verifyMethod(input: { kind: "upi" | "bank"; detail: string }): Promise<boolean>;
  createPayout(input: { amountPaise: number; kind: "upi" | "bank"; detail: string; reference: string }): Promise<"processing" | "completed">;
}

export function getProvider(): PayoutProvider | null {
  return null;
}

export const payoutsAvailable = () => getProvider() !== null;
