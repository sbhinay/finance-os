import { CreditCard } from "@/types/creditCard";

const STORAGE_KEY = "finance_os_cards";

export const creditCardRepository = {
  getAll(): CreditCard[] {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveAll(cards: CreditCard[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  },

  add(card: CreditCard) {
    const cards = this.getAll();
    cards.push(card);
    this.saveAll(cards);
  },

  delete(id: string) {
    const cards = this.getAll().filter((c) => c.id !== id);
    this.saveAll(cards);
  },

  update(updated: CreditCard) {
    const cards = this.getAll().map((c) =>
      c.id === updated.id ? updated : c
    );
    this.saveAll(cards);
  },
};