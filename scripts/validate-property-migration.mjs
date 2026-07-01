import fs from "node:fs";
import path from "node:path";
import { migratePropertyParents } from "../utils/propertyMigration.ts";

const fixturePath = path.resolve(
  process.argv[2] ?? "C:/Users/singha2/Downloads/FinanceOS_2026-06-29.json"
);
const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const migrated = migratePropertyParents(
  payload.properties ?? [],
  payload.houseLoans ?? [],
  payload.propertyTaxes ?? [],
  payload.transactions ?? []
);

if (migrated.properties.length !== 1) {
  throw new Error(`Expected one unambiguous fixture Property; received ${migrated.properties.length}.`);
}
const fixtureProperty = migrated.properties[0];
const fixtureLoan = migrated.houseLoans[0];
const fixtureTax = migrated.propertyTaxes[0];
if (
  fixtureProperty.id !== fixtureLoan.id
  || fixtureLoan.propertyId !== fixtureProperty.id
  || fixtureTax.propertyId !== fixtureProperty.id
) {
  throw new Error("Fixture mortgage/property-tax parent links were not migrated consistently.");
}

const synthetic = migratePropertyParents(
  [],
  [
    {
      id: "loan-a",
      name: "Primary",
      principal: 100,
      remaining: 90,
      payment: 10,
      schedule: "Monthly",
      source: "bank",
      startDate: "2026-01-01",
      endDate: "2030-01-01",
      nextPaymentDate: "2026-07-01",
      interestRate: 1,
    },
  ],
  [
    { id: "tax-a", name: "Primary", accountNumber: "1", payments: [] },
    { id: "tax-b", name: "Rental", accountNumber: "2", payments: [] },
  ],
  [
    {
      id: "mortgage-tx",
      type: "loan_payment",
      subType: "mortgage",
      purpose: "mortgage_payment",
      amount: 10,
      date: "2026-05-01",
      createdAt: "2026-05-01T12:00:00.000Z",
      description: "Mortgage Payment - Primary",
      sourceId: "bank",
      currency: "CAD",
      status: "cleared",
      linkedPropertyId: "loan-a",
      recurringOriginType: "house_loan",
      recurringOriginId: "loan-a",
    },
    {
      id: "tax-tx",
      type: "expense",
      purpose: "recurring_expense",
      amount: 50,
      date: "2026-06-01",
      createdAt: "2026-06-01T12:00:00.000Z",
      description: "Property Tax - Primary",
      sourceId: "bank",
      categoryId: "tax",
      currency: "CAD",
      status: "cleared",
      linkedPropertyId: "tax-a",
      recurringOriginType: "property_tax",
      recurringOriginId: "tax-payment-a",
    },
  ]
);

if (synthetic.properties.length !== 2) {
  throw new Error("Synthetic migration should merge one exact match and preserve one distinct property.");
}
if (synthetic.transactions[0].linkedHouseLoanId !== "loan-a") {
  throw new Error("Unambiguous mortgage transaction was not linked to its mortgage parent.");
}
if (synthetic.transactions[1].linkedPropertyId !== "loan-a") {
  throw new Error("Unambiguous property-tax transaction was not relinked to its Property parent.");
}

console.log(
  `Property migration validated: ${migrated.properties.length} fixture parent, `
  + `${migrated.houseLoans.length} mortgage link, ${migrated.propertyTaxes.length} tax link.`
);
