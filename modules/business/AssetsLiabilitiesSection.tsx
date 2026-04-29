"use client";

import { useMemo, useState, type ReactNode } from "react";
import { fmtCAD, fmtDate, getNextOccurrence, toFixed2, toMonthly } from "@/utils/finance";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useVehicles, useHouseLoans, usePropertyTax } from "./useAssets";
import { TransactionForm, type TransactionFormInitial } from "./TransactionForm";
import { PaymentSchedule, type PropertyTaxPayment, type Vehicle, type HouseLoan, type PropertyTax } from "@/types/domain";

type NavTarget = "accounts" | "cards" | "vehicles" | "houseloans" | "propertytax";
type PendingPropertyMark = { propertyId: string; paymentId: string } | null;

type UpcomingItem =
  | { kind: "vehicle"; id: string; date: string; name: string; amount: number; note: string; vehicle: Vehicle }
  | { kind: "house"; id: string; date: string; name: string; amount: number; note: string; loan: HouseLoan }
  | { kind: "propertyTax"; id: string; date: string; name: string; amount: number; note: string; property: PropertyTax; payment: PropertyTaxPayment };

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 150, padding: "14px 16px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20, color: color ?? "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({
  title,
  accent,
  children,
  actions,
}: {
  title: string;
  accent: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ borderTop: `4px solid ${accent}`, padding: "16px 18px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  variant = "secondary",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "green";
}) {
  const styles = {
    primary: { background: "#1a5fa8", color: "#fff", border: "1px solid #1a5fa8" },
    secondary: { background: "#fff", color: "#1f2937", border: "1px solid #d1d5db" },
    green: { background: "#1a7f3c", color: "#fff", border: "1px solid #1a7f3c" },
  }[variant];

  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 8,
        cursor: "pointer",
        ...styles,
      }}
    >
      {children}
    </button>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "#f9fafb", color: "#6b7280", fontSize: 13, border: "1px dashed #d1d5db" }}>
      {children}
    </div>
  );
}

function amountBySchedule(amount: number, schedule: PaymentSchedule) {
  return toMonthly(amount, schedule);
}

function sortByDate<T extends { date: string }>(items: T[]) {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

function todayDateOnly() {
  return new Date().toISOString().split("T")[0];
}

export function AssetsLiabilitiesSection({ onNavigate }: { onNavigate: (target: NavTarget) => void }) {
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();
  const { propertyTaxes, markPaid } = usePropertyTax();

  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<TransactionFormInitial | undefined>(undefined);
  const [txFormTitle, setTxFormTitle] = useState("New Transaction");
  const [scheduledAmount, setScheduledAmount] = useState<number | undefined>(undefined);
  const [pendingPropertyMark, setPendingPropertyMark] = useState<PendingPropertyMark>(null);

  const activeAccounts = accounts.filter((a) => a.active !== false);
  const activeCards = cards.filter((c) => c.active !== false);

  const liquidAssets = toFixed2(activeAccounts.reduce((sum, a) => sum + a.openingBalance, 0));
  const cardLiabilities = toFixed2(activeCards.reduce((sum, c) => sum + c.openingBalance, 0));
  const houseLoanLiabilities = toFixed2(houseLoans.reduce((sum, l) => sum + l.remaining, 0));
  const totalLiabilities = toFixed2(cardLiabilities + houseLoanLiabilities);
  const netWorth = toFixed2(liquidAssets - totalLiabilities);

  const vehicleMonthly = toFixed2(vehicles.reduce((sum, v) => sum + amountBySchedule(v.payment, v.schedule), 0));
  const unpaidPropertyTax = toFixed2(
    propertyTaxes.flatMap((p) => p.payments ?? []).filter((p) => !p.paid).reduce((sum, p) => sum + p.amount, 0)
  );

  const financialAssetCandidates = activeAccounts.filter((a) => {
    const name = a.name.toLowerCase();
    return name.includes("tfsa") || name.includes("rrsp") || name.includes("investment") || name.includes("savings");
  });

  const upcomingObligations = useMemo<UpcomingItem[]>(() => {
    const vehicleItems: UpcomingItem[] = vehicles
      .filter((vehicle) => vehicle.nextPaymentDate && vehicle.payment > 0)
      .map((vehicle) => {
        const nextDate = getNextOccurrence(vehicle.nextPaymentDate, vehicle.schedule) ?? vehicle.nextPaymentDate;
        return {
          kind: "vehicle",
          id: vehicle.id,
          date: nextDate,
          name: vehicle.name,
          amount: vehicle.payment,
          note: `${vehicle.vtype} payment`,
          vehicle,
        };
      });

    const houseItems: UpcomingItem[] = houseLoans
      .filter((loan) => loan.nextPaymentDate && loan.payment > 0)
      .map((loan) => {
        const nextDate = getNextOccurrence(loan.nextPaymentDate, loan.schedule) ?? loan.nextPaymentDate;
        return {
          kind: "house",
          id: loan.id,
          date: nextDate,
          name: loan.name,
          amount: loan.payment,
          note: "Mortgage / house loan payment",
          loan,
        };
      });

    const propertyItems: UpcomingItem[] = propertyTaxes.flatMap((property) =>
      (property.payments ?? [])
        .filter((payment) => !payment.paid)
        .map((payment) => ({
          kind: "propertyTax" as const,
          id: payment.id,
          date: payment.date,
          name: property.name,
          amount: payment.amount,
          note: payment.note || "Property tax instalment",
          property,
          payment,
        }))
    );

    return sortByDate([...vehicleItems, ...houseItems, ...propertyItems]).slice(0, 8);
  }, [vehicles, houseLoans, propertyTaxes]);

  const upcomingTotal30 = useMemo(() => {
    const today = todayDateOnly();
    const cutoff = new Date(`${today}T00:00:00`);
    cutoff.setDate(cutoff.getDate() + 30);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return toFixed2(upcomingObligations.filter((item) => item.date >= today && item.date <= cutoffStr).reduce((sum, item) => sum + item.amount, 0));
  }, [upcomingObligations]);

  function resetTxFlow() {
    setTxFormOpen(false);
    setTxFormInitial(undefined);
    setTxFormTitle("New Transaction");
    setScheduledAmount(undefined);
    setPendingPropertyMark(null);
  }

  function openVehiclePayment(vehicle: Vehicle) {
    const nextDate = vehicle.nextPaymentDate ? (getNextOccurrence(vehicle.nextPaymentDate, vehicle.schedule) ?? vehicle.nextPaymentDate) : todayDateOnly();
    setTxFormTitle(`Log Vehicle Payment - ${vehicle.name}`);
    setScheduledAmount(vehicle.payment);
    setPendingPropertyMark(null);
    setTxFormInitial({
      type: "expense",
      amount: vehicle.payment,
      date: nextDate,
      description: `Vehicle Payment - ${vehicle.name}`,
      sourceId: vehicle.source || "",
      linkedVehicleId: vehicle.id,
      mode: "Debit",
      tag: "Personal",
    });
    setTxFormOpen(true);
  }

  function openPropertyTaxPayment(property: PropertyTax, payment: PropertyTaxPayment) {
    setPendingPropertyMark({ propertyId: property.id, paymentId: payment.id });
    setTxFormTitle(`Mark Property Tax Paid - ${property.name}`);
    setScheduledAmount(payment.amount);
    setTxFormInitial({
      type: "expense",
      amount: payment.amount,
      date: payment.date,
      description: `Property Tax - ${property.name}`,
      mode: "Bank Transfer",
      tag: "Personal",
    });
    setTxFormOpen(true);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Assets & Liabilities</div>
          <div style={{ fontSize: 13, color: "#6b7280", maxWidth: 760 }}>
            This is the new unified command area for asset, debt, and net worth tracking. Legacy tabs remain available while we migrate the real workflows here.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionBtn onClick={() => onNavigate("vehicles")}>Vehicles</ActionBtn>
          <ActionBtn onClick={() => onNavigate("houseloans")}>House Loans</ActionBtn>
          <ActionBtn onClick={() => onNavigate("propertytax")}>Property Tax</ActionBtn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatBox label="Liquid Assets" value={fmtCAD(liquidAssets)} color="#1a7f3c" sub="active bank and cash accounts" />
        <StatBox label="Tracked Liabilities" value={fmtCAD(totalLiabilities)} color="#a31515" sub="credit cards + house loans" />
        <StatBox label="Net Worth Snapshot" value={fmtCAD(netWorth)} color={netWorth >= 0 ? "#1a7f3c" : "#a31515"} sub="market values not modeled yet" />
        <StatBox label="Next 30 Days" value={fmtCAD(upcomingTotal30)} color="#a05c00" sub="upcoming obligations from this page" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <SectionCard
          title="Upcoming Obligations"
          accent="#a05c00"
          actions={<ActionBtn onClick={() => onNavigate("propertytax")}>Legacy Schedules</ActionBtn>}
        >
          {upcomingObligations.length === 0 ? (
            <EmptyNote>No upcoming obligations are scheduled yet. Add next payment dates in the legacy asset tabs to make this page actionable.</EmptyNote>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {upcomingObligations.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {fmtDate(item.date)} | {item.note}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <div style={{ fontWeight: 800, color: "#111827", minWidth: 88, textAlign: "right" }}>{fmtCAD(item.amount)}</div>
                    {item.kind === "vehicle" && <ActionBtn variant="green" onClick={() => openVehiclePayment(item.vehicle)}>Log Payment</ActionBtn>}
                    {item.kind === "propertyTax" && <ActionBtn variant="green" onClick={() => openPropertyTaxPayment(item.property, item.payment)}>Mark Paid</ActionBtn>}
                    {item.kind === "house" && <ActionBtn onClick={() => onNavigate("houseloans")}>Open Legacy</ActionBtn>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <SectionCard
          title="Real Estate"
          accent="#b45309"
          actions={<ActionBtn onClick={() => onNavigate("houseloans")}>Open Legacy</ActionBtn>}
        >
          {houseLoans.length === 0 && propertyTaxes.length === 0 ? (
            <EmptyNote>No real estate items yet. Use the legacy House Loans and Property Tax tabs while this area takes on their workflows.</EmptyNote>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {houseLoans.slice(0, 3).map((loan) => (
                <div key={loan.id} style={{ paddingBottom: 10, borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{loan.name}</div>
                  {loan.address && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{loan.address}</div>}
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Remaining {fmtCAD(loan.remaining)} | Payment {fmtCAD(loan.payment)}/{loan.schedule}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                    Next due {fmtDate(getNextOccurrence(loan.nextPaymentDate, loan.schedule) ?? loan.nextPaymentDate)}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {propertyTaxes.length} property tax schedule{propertyTaxes.length === 1 ? "" : "s"} | unpaid planned tax {fmtCAD(unpaidPropertyTax)}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Direct mortgage logging stays in the legacy view for now until principal vs interest handling is cleaner.
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Vehicles"
          accent="#1d4ed8"
          actions={<ActionBtn onClick={() => onNavigate("vehicles")}>Open Legacy</ActionBtn>}
        >
          {vehicles.length === 0 ? (
            <EmptyNote>No vehicles yet. Add leases and financed vehicles in the legacy Vehicles tab for now.</EmptyNote>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {vehicles.slice(0, 3).map((vehicle) => {
                const nextDate = vehicle.nextPaymentDate ? (getNextOccurrence(vehicle.nextPaymentDate, vehicle.schedule) ?? vehicle.nextPaymentDate) : "";
                return (
                  <div key={vehicle.id} style={{ paddingBottom: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{vehicle.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                          {vehicle.year} {vehicle.make} {vehicle.model} | {vehicle.vtype}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                          {fmtCAD(vehicle.payment)}/{vehicle.schedule}
                          {nextDate ? ` | Next ${fmtDate(nextDate)}` : " | Next payment date not set"}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start" }}>
                        <ActionBtn variant="green" onClick={() => openVehiclePayment(vehicle)}>Log Payment</ActionBtn>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 12, color: "#6b7280" }}>Monthly equivalent across all vehicles: {fmtCAD(vehicleMonthly)}</div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Financial Assets"
          accent="#047857"
          actions={<ActionBtn onClick={() => onNavigate("accounts")}>Accounts</ActionBtn>}
        >
          {financialAssetCandidates.length === 0 ? (
            <EmptyNote>
              Dedicated TFSA, RRSP, and investment account modeling is still upcoming. This page will absorb those flows later without replacing the ledger-first transaction model.
            </EmptyNote>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {financialAssetCandidates.slice(0, 4).map((account) => (
                <div key={account.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 8, borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{account.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{account.type}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: account.openingBalance >= 0 ? "#1a7f3c" : "#a31515" }}>{fmtCAD(account.openingBalance)}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Liabilities"
          accent="#991b1b"
          actions={<ActionBtn onClick={() => onNavigate("cards")}>Credit Cards</ActionBtn>}
        >
          {activeCards.length === 0 && houseLoans.length === 0 ? (
            <EmptyNote>No liabilities tracked yet. Credit cards and house loans will continue to live in their legacy tabs during the transition.</EmptyNote>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>Credit cards owing: {fmtCAD(cardLiabilities)}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>House loans remaining: {fmtCAD(houseLoanLiabilities)}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>Future liability accounts and LOCs will be added here next.</div>
            </div>
          )}
        </SectionCard>
      </div>

      <TransactionForm
        open={txFormOpen}
        onClose={resetTxFlow}
        initial={txFormInitial}
        scheduledAmount={scheduledAmount}
        title={txFormTitle}
        onSaved={(txn) => {
          if (pendingPropertyMark) {
            markPaid(pendingPropertyMark.propertyId, pendingPropertyMark.paymentId, true, txn.date ?? todayDateOnly());
          }
          resetTxFlow();
        }}
      />
    </div>
  );
}
