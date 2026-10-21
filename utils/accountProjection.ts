import type { ProjectionEvent } from "./projectionScenarios.ts";

/**
 * Per-bank-account running balances for the Dashboard projection.
 *
 * The combined projection pools every account; this layer splits each event
 * onto the bank account it actually moves, so a shortfall in one account is
 * visible even when the pooled total looks healthy.
 */

export interface BankAccountRef {
  id: string;
  name: string;
  openingBalance: number;
}

export interface CardRef {
  id: string;
  name: string;
}

export type AccountRefKind = "bank" | "card" | "none";

export interface AccountLeg {
  accountId: string;
  amount: number;
}

export interface AccountResolver {
  /** Bank account id for an id or (legacy) account-name reference. */
  bankId(ref?: string): string | null;
  kind(ref?: string): AccountRefKind;
}

function toFixed2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createAccountResolver(accounts: BankAccountRef[], cards: CardRef[]): AccountResolver {
  const bankById = new Map(accounts.map((account) => [account.id, account.id]));
  const bankByName = new Map(accounts.map((account) => [account.name, account.id]));
  const cardIds = new Set(cards.flatMap((card) => [card.id, card.name]));
  const bankId = (ref?: string) => (ref ? bankById.get(ref) ?? bankByName.get(ref) ?? null : null);
  return {
    bankId,
    kind(ref?: string) {
      if (bankId(ref)) return "bank";
      if (ref && cardIds.has(ref)) return "card";
      return "none";
    },
  };
}

/** Bank-account movements of one event. Card-paid and unassigned events have none. */
export function eventAccountLegs(event: ProjectionEvent, resolver: AccountResolver): AccountLeg[] {
  if (event.toAccount) {
    const moved = toFixed2(event.displayAmount ?? Math.abs(event.amount));
    const legs: AccountLeg[] = [];
    const from = resolver.bankId(event.account);
    const to = resolver.bankId(event.toAccount);
    if (from) legs.push({ accountId: from, amount: -moved });
    if (to) legs.push({ accountId: to, amount: moved });
    return legs;
  }
  const id = resolver.bankId(event.account);
  return id && event.amount !== 0 ? [{ accountId: id, amount: event.amount }] : [];
}

export interface AccountDay {
  dateStr: string;
  balance: number;
  legs: Array<AccountLeg & { event: ProjectionEvent }>;
}

export interface AccountShortfall {
  accountId: string;
  name: string;
  startBalance: number;
  /** First day the balance is below zero (today if it already is). */
  firstDate: string;
  firstBalance: number;
  lowestDate: string;
  lowestBalance: number;
  /** Outflows from this account on the first short day. */
  causes: Array<{ label: string; amount: number }>;
}

export interface AccountTimelines {
  byAccount: Map<string, AccountDay[]>;
  shortfalls: AccountShortfall[];
  /** Day + account pairs where the balance crosses below zero. */
  crossings: Map<string, Array<{ accountId: string; name: string; balance: number }>>;
  /** Events with a cash effect that are not tied to any bank or card. */
  unassignedCount: number;
}

export function buildAccountTimelines(
  accounts: BankAccountRef[],
  days: Array<{ dateStr: string; events: ProjectionEvent[] }>,
  resolver: AccountResolver
): AccountTimelines {
  const byAccount = new Map<string, AccountDay[]>();
  const shortfalls: AccountShortfall[] = [];
  const crossings = new Map<string, Array<{ accountId: string; name: string; balance: number }>>();
  let unassignedCount = 0;

  const legsByDay = days.map((day) => day.events.flatMap((event) => {
    const legs = eventAccountLegs(event, resolver);
    if (!legs.length && event.amount !== 0 && resolver.kind(event.account) === "none") unassignedCount += 1;
    return legs.map((leg) => ({ ...leg, event }));
  }));

  accounts.forEach((account) => {
    const start = toFixed2(account.openingBalance);
    let balance = start;
    let previous = start;
    const timeline: AccountDay[] = [];
    let shortfall: AccountShortfall | null = null;

    days.forEach((day, index) => {
      const legs = legsByDay[index].filter((leg) => leg.accountId === account.id);
      balance = toFixed2(balance + legs.reduce((sum, leg) => sum + leg.amount, 0));
      timeline.push({ dateStr: day.dateStr, balance, legs });

      const crossed = balance < 0 && (index === 0 ? true : previous >= 0);
      if (crossed) {
        crossings.set(day.dateStr, [...(crossings.get(day.dateStr) ?? []), { accountId: account.id, name: account.name, balance }]);
      }
      if (balance < 0 && !shortfall) {
        shortfall = {
          accountId: account.id,
          name: account.name,
          startBalance: start,
          firstDate: day.dateStr,
          firstBalance: balance,
          lowestDate: day.dateStr,
          lowestBalance: balance,
          causes: legs.filter((leg) => leg.amount < 0).map((leg) => ({ label: leg.event.label, amount: -leg.amount })),
        };
      } else if (shortfall && balance < shortfall.lowestBalance) {
        shortfall.lowestBalance = balance;
        shortfall.lowestDate = day.dateStr;
      }
      previous = balance;
    });

    byAccount.set(account.id, timeline);
    if (shortfall) shortfalls.push(shortfall);
  });

  shortfalls.sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.lowestBalance - b.lowestBalance);
  return { byAccount, shortfalls, crossings, unassignedCount };
}
