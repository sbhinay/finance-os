"use client";

import { useState, useCallback } from "react";
import { Account, AccountType } from "@/types/account";
import { accountRepository } from "@/repositories/accountRepository";
import { validateNewAccount } from "@/rules/accountRules";

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>(() => accountRepository.getAll());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setAccounts(accountRepository.getAll());
  }, []);

  const addAccount = (
    name: string,
    type: AccountType,
    balance: number
  ) => {
    const validationError = validateNewAccount(name, accounts);

    if (validationError) {
      setError(validationError);
      return;
    }

    const newAccount: Account = {
      id: Date.now().toString(),
      name,
      type,
      currency: "CAD",
      openingBalance: balance,
      active: true,
      createdAt: new Date().toISOString(),
    };

    accountRepository.add(newAccount);
    load();
    setError(null);
  };

  const deleteAccount = (id: string) => {
    accountRepository.delete(id);
    load();
  };

  const updateAccount = (updated: Account) => {
    accountRepository.update(updated);
    load();
  };

  return {
    accounts,
    addAccount,
    deleteAccount,
    updateAccount,
    reloadAccounts: load, // ✅ important
    error,
  };
}