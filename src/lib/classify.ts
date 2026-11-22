import type { AccountType, FlowClass } from './types.ts'

const MARKET = /dividend|interest|capital gain|\bstcg\b|\bltcg\b|reinvest|commission|\bfee\b|withholding|price change/i
const INTERNAL_INVESTMENT = /\bbuy\b|\bsell\b|bought|sold|rebalance|exchange|sweep/i

/**
 * Approximate split between external cash flows and market/income activity.
 * Cash spending and pay are flows. Interest, dividends, and fees stay in the market result.
 */
export function classifyTransaction(description: string, accountType: AccountType): FlowClass {
  if (MARKET.test(description)) return 'market'
  if (accountType === 'investment' && INTERNAL_INVESTMENT.test(description)) return 'ignore'
  return 'flow'
}
