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
import { removeOwnedRecurringForAccount, syncAccountFeeRecurring } from "@/utils/recurringOwners";
import { DATA_CHANGED_EVENT } from "@/utils/events";

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccounts(accountRepository.getAll());
    const handler = () => setAccounts(accountRepository.getAll());
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, []);

  const load = useCallback(() => {
    setAccounts(accountRepository.getAll());
  }, []);

  const addAccount = (
    name: string,
    type: AccountType,
    balance: number,
    extras?: Partial<Account>
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
      ...extras,
    };

    accountRepository.add(newAccount);
    syncAccountFeeRecurring(newAccount);
    load();
    setError(null);
    return newAccount;
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

    removeOwnedRecurringForAccount(id);
    accountRepository.delete(id);
    load();
  };

  const updateAccount = (updated: Account) => {
    accountRepository.update(updated);
    syncAccountFeeRecurring(updated);
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
