"use client";

import { useState, useEffect, useCallback } from "react";
import { CreditCard, CardType } from "@/types/creditCard";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import { getCardReferenceReasons } from "@/utils/referenceIntegrity";

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCards(creditCardRepository.getAll());
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
    linkedAccountId?: string
  ) => {
    const newCard: CreditCard = {
      id: Date.now().toString(),
      name,
      issuer,
      type,
      limitAmount: limit,
      openingBalance: balance,
      balanceBase: balance,
      linkedAccountId,
      active: true,
      createdAt: new Date().toISOString(),
    };

    creditCardRepository.add(newCard);
    load();
  };

  const deleteCard = (id: string) => {
    const reasons = getCardReferenceReasons(id, transactionRepository.getAll());
    if (reasons.length > 0) {
      const existing = creditCardRepository.getAll().find((c) => c.id === id);
      if (existing) {
        creditCardRepository.update({ ...existing, active: false });
      }
      load();
      window.alert(`Credit card cannot be deleted because it is referenced by existing transactions. It has been deactivated instead. ${reasons.join(", ")}.`);
      return;
    }

    creditCardRepository.delete(id);
    load();
  };

  return {
    cards,
    addCard,
    deleteCard,
    reloadCards: load, // ✅ important
  };
}