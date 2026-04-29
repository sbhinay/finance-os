"use client";

import { useState, useEffect, useCallback } from "react";
import { Account, AccountType } from "@/types/account";
import { accountRepository } from "@/repositories/accountRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import { vehicleRepository, houseLoanRepository } from "@/repositories/assetRepositories";
import { validateNewAccount } from "@/rules/accountRules";
import { getAccountReferenceReasons } from "@/utils/referenceIntegrity";

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccounts(accountRepository.getAll());
  }, []);

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
      balanceBase: balance,
      active: true,
      createdAt: new Date().toISOString(),
    };

    accountRepository.add(newAccount);
    load();
    setError(null);
  };

  const deleteAccount = (id: string) => {
    const reasons = getAccountReferenceReasons(
      id,
      transactionRepository.getAll(),
      creditCardRepository.getAll(),
      fixedPaymentRepository.getAll(),
      vehicleRepository.getAll(),
      houseLoanRepository.getAll()
    );

    if (reasons.length > 0) {
      const existing = accountRepository.getAll().find((a) => a.id === id);
      if (existing) {
        accountRepository.update({ ...existing, active: false });
      }
      load();
      window.alert(`Account cannot be deleted because it is referenced by existing data. It has been deactivated instead. ${reasons.join(", ")}.`);
      return;
    }

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