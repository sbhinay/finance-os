"use client";

import { useState, useEffect, useCallback } from "react";
import { CreditCard, CardType } from "@/types/creditCard";
import { creditCardRepository } from "@/repositories/creditCardRepository";

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
      linkedAccountId,
      active: true,
      createdAt: new Date().toISOString(),
    };

    creditCardRepository.add(newCard);
    load();
  };

  const deleteCard = (id: string) => {
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