import { Account } from "@/types/account";

export function validateNewAccount(
  name: string,
  existingAccounts: Account[]
): string | null {
  if (!name || name.trim() === "") {
    return "Account name is required";
  }

  const duplicate = existingAccounts.find(
    (acc) => acc.name.toLowerCase() === name.toLowerCase()
  );

  if (duplicate) {
    return "Account with this name already exists";
  }

  return null;
}