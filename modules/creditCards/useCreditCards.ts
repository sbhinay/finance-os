"use client";

import { useState, useEffect, useCallback } from "react";
import { CreditCard, CardType } from "@/types/creditCard";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import { getCardReferenceReasons } from "@/utils/referenceIntegrity";
import { removeOwnedRecurringForCard, syncCardFeeRecurring } from "@/utils/recurringOwners";
import { DATA_CHANGED_EVENT } from "@/utils/events";

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCards(creditCardRepository.getAll());
    const handler = () => setCards(creditCardRepository.getAll());
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, []);

  const load = useCallback(() => {
    setCards(creditCardRepository.getAll());
  }, []);

  const addCard = (
    name: string,
    issuer: string,
    type: CardType,
    limit: number,
    balance: number,
    linkedAccountId?: string,
    extras?: Partial<CreditCard>
  ) => {
    const newCard: CreditCard = {
      id: Date.now().toString(),
      name,
      issuer,
      type,
      limitAmount: limit,
      openingBalance: balance,
      linkedAccountId,
      active: true,
      createdAt: new Date().toISOString(),
      ...extras,
    };

    creditCardRepository.add(newCard);
    syncCardFeeRecurring(newCard);
    load();
    return newCard;
  };

  const deleteCard = (id: string) => {
    const reasons = getCardReferenceReasons(
      id,
      transactionRepository.getAll(),
      fixedPaymentRepository.getAll()
    );
    if (reasons.length > 0) {
      const existing = creditCardRepository.getAll().find((c) => c.id === id);
      if (existing) {
        creditCardRepository.update({ ...existing, active: false });
      }
      load();
      window.alert(`Credit card cannot be deleted because it is referenced by existing data. It has been deactivated instead. ${reasons.join(", ")}.`);
      return;
    }

    removeOwnedRecurringForCard(id);
    creditCardRepository.delete(id);
    load();
  };

  const updateCard = (updated: CreditCard) => {
    creditCardRepository.update(updated);
    syncCardFeeRecurring(updated);
    load();
  };

  return {
    cards,
    addCard,
    deleteCard,
    updateCard,
    reloadCards: load,
  };
}
