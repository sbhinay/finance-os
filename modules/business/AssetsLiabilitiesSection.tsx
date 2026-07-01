"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { fmtCAD, fmtDate, getNextOccurrence, toFixed2, toMonthly } from "@/utils/finance";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useVehicles, useHouseLoans, usePropertyTax } from "./useAssets";
import { TransactionForm, type TransactionFormInitial } from "./TransactionForm";
import { PaymentSchedule, type PropertyTaxPayment, type Vehicle, type HouseLoan, type PropertyTax } from "@/types/domain";
import { theme } from "@/lib/theme";
import { useLiabilities } from "./useLiabilities";
import type { Liability } from "@/types/domain";
import { getLiabilityLedger, getLiabilitySummary } from "./useLiabilities";
import { useTransactions } from "@/modules/transactions/useTransactions";

type NavTarget = "accounts" | "cards" | "vehicles" | "houseloans";
type PendingPropertyMark = { propertyId: string; paymentId: string } | null;

type UpcomingItem =
  | { kind: "vehicle"; id: string; date: string; name: string; amount: number; note: string; vehicle: Vehicle }
  | { kind: "house"; id: string; date: string; name: string; amount: number; note: string; loan: HouseLoan }
  | { kind: "housePropertyTax"; id: string; date: string; name: string; amount: number; note: string; loan: HouseLoan }
  | { kind: "propertyTax"; id: string; date: string; name: string; amount: number; note: string; property: PropertyTax; payment: PropertyTaxPayment };

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...theme.cardStyle(), flex: 1, minWidth: 160, padding: "16px 18px", background: theme.colors.surfaceAlt }}>
      <div style={{ fontSize: 11, color: theme.colors.textSoft, fontWeight: 700, textTransform: "uppercase", marginBottom: 6, letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 22, color: color ?? theme.colors.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>{sub}</div>}
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
    <div style={{ ...theme.cardStyle(accent), borderTop: `3px solid ${accent}`, overflow: "hidden", background: theme.colors.surface }}>
      <div style={{ padding: "16px 18px 14px" }}>
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
  variant?: "primary" | "secondary" | "green" | "danger";
}) {
  const styles = {
    primary: { background: "#1a5fa8", color: "#fff", border: "1px solid #1a5fa8" },
    secondary: { background: "#fff", color: "#1f2937", border: "1px solid #d1d5db" },
    green: { background: "#1a7f3c", color: "#fff", border: "1px solid #1a7f3c" },
    danger: { background: "#fff", color: "#a31515", border: "1px solid #fecaca" },
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

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.38)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "4vh 16px", overflowY: "auto" }}>
      <div style={{ width: "min(920px, 100%)", background: "#fff", borderRadius: 8, border: "1px solid #d1d5db", boxShadow: "0 20px 50px rgba(15,23,42,.24)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} aria-label="Close lender details" style={{ border: "none", background: "transparent", color: "#475569", fontSize: 18, cursor: "pointer" }}>x</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
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
  const { transactions } = useTransactions();
  const {
    liabilities,
    balances: liabilityBalances,
    saveLiability,
    deleteLiability,
    relinkTransaction,
  } = useLiabilities();

  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<TransactionFormInitial | undefined>(undefined);
  const [txFormTitle, setTxFormTitle] = useState("New Transaction");
  const [scheduledAmount, setScheduledAmount] = useState<number | undefined>(undefined);
  const [pendingPropertyMark, setPendingPropertyMark] = useState<PendingPropertyMark>(null);
  const [showLenderForm, setShowLenderForm] = useState(false);
  const [lenderName, setLenderName] = useState("");
  const [lenderType, setLenderType] = useState<Liability["type"]>("Personal Loan");
  const [lenderTag, setLenderTag] = useState<Liability["tag"]>("Personal");
  const [selectedLiabilityId, setSelectedLiabilityId] = useState<string | null>(null);
  const [liabilityDraft, setLiabilityDraft] = useState<Liability | null>(null);
  const [showArchivedLiabilities, setShowArchivedLiabilities] = useState(false);
  const [attachTransactionId, setAttachTransactionId] = useState("");
  const snapshotAmountRef = useRef<HTMLInputElement>(null);
  const snapshotDateRef = useRef<HTMLInputElement>(null);

  const activeAccounts = accounts.filter((a) => a.active !== false);
  const activeCards = cards.filter((c) => c.active !== false);

  const liquidAssets = toFixed2(activeAccounts.reduce((sum, a) => sum + a.openingBalance, 0));
  const cardLiabilities = toFixed2(activeCards.reduce((sum, c) => sum + c.openingBalance, 0));
  const houseLoanLiabilities = toFixed2(houseLoans.reduce((sum, l) => sum + l.remaining, 0));
  const lenderLiabilities = toFixed2(
    liabilities.reduce((sum, liability) => sum + (liabilityBalances[liability.id] ?? 0), 0)
  );
  const totalLiabilities = toFixed2(cardLiabilities + houseLoanLiabilities + lenderLiabilities);
  const netWorth = toFixed2(liquidAssets - totalLiabilities);

  const vehicleMonthly = toFixed2(vehicles.reduce((sum, v) => sum + amountBySchedule(v.payment, v.schedule), 0));
  const ownedPropertyTaxUnpaid = toFixed2(
    houseLoans.filter((loan) => loan.propertyTaxAmount && loan.propertyTaxAmount > 0).reduce((sum, loan) => sum + (loan.propertyTaxAmount ?? 0), 0)
  );
  const unpaidPropertyTax = toFixed2(
    ownedPropertyTaxUnpaid + propertyTaxes.flatMap((p) => p.payments ?? []).filter((p) => !p.paid).reduce((sum, p) => sum + p.amount, 0)
  );

  const financialAssetCandidates = activeAccounts.filter((a) => {
    const name = a.name.toLowerCase();
    return name.includes("tfsa") || name.includes("rrsp") || name.includes("investment") || name.includes("savings");
  });
  const selectedLiability = selectedLiabilityId
    ? liabilities.find((liability) => liability.id === selectedLiabilityId) ?? null
    : null;
  const selectedLiabilitySummary = useMemo(
    () => selectedLiability ? getLiabilitySummary(selectedLiability, transactions) : null,
    [selectedLiability, transactions]
  );
  const selectedLiabilityLedger = useMemo(
    () => selectedLiability ? getLiabilityLedger(selectedLiability, transactions) : [],
    [selectedLiability, transactions]
  );
  const unlinkedLoanTransactions = useMemo(
    () => transactions
      .filter((transaction) =>
        !transaction.linkedLiabilityId
        && (transaction.type === "loan_receipt" || transaction.type === "loan_payment")
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );
  const visibleLiabilities = liabilities.filter(
    (liability) => showArchivedLiabilities || !liability.archived
  );

  function openLiabilityDetails(liability: Liability) {
    setSelectedLiabilityId(liability.id);
    setLiabilityDraft({ ...liability });
    setAttachTransactionId("");
  }

  function closeLiabilityDetails() {
    setSelectedLiabilityId(null);
    setLiabilityDraft(null);
    setAttachTransactionId("");
  }

  function saveLiabilityDraft() {
    if (!liabilityDraft?.name.trim()) return;
    const snapshotAmountText = snapshotAmountRef.current?.value ?? "";
    const snapshotDate = snapshotDateRef.current?.value || undefined;
    const snapshotAmount = snapshotAmountText === "" ? undefined : Number(snapshotAmountText);
    const hasSnapshot = Number.isFinite(snapshotAmount) && !!snapshotDate;
    const saved = saveLiability({
      ...liabilityDraft,
      name: liabilityDraft.name.trim(),
      notes: liabilityDraft.notes?.trim() || undefined,
      balanceSnapshotAmount: hasSnapshot ? snapshotAmount : undefined,
      balanceSnapshotDate: hasSnapshot ? snapshotDate : undefined,
    });
    setLiabilityDraft(saved);
  }

  function archiveOrDeleteLiability(liability: Liability) {
    const linkedCount = transactions.filter(
      (transaction) => transaction.linkedLiabilityId === liability.id
    ).length;
    const prompt = linkedCount > 0
      ? `Archive ${liability.name}? Its ${linkedCount} linked transaction(s) will remain intact.`
      : `Delete ${liability.name}? This lender has no linked transactions.`;
    if (!confirm(prompt)) return;
    deleteLiability(liability.id);
    closeLiabilityDetails();
  }

  function attachSelectedTransaction() {
    if (!selectedLiability || !attachTransactionId) return;
    const transaction = transactions.find((item) => item.id === attachTransactionId);
    if (!transaction) return;
    relinkTransaction(transaction, selectedLiability.id);
    setAttachTransactionId("");
  }

  function loanPurpose(liability: Liability, direction: "receipt" | "payment") {
    if (liability.type === "Bank Loan") {
      return direction === "receipt" ? "bank_loan_receipt" : "bank_loan_payment";
    }
    if (liability.type === "Shareholder Loan") {
      return direction === "receipt" ? "shareholder_loan_receipt" : "shareholder_loan_payment";
    }
    return direction === "receipt" ? "personal_loan_receipt" : "personal_loan_payment";
  }

  function openLiabilityTransaction(liability: Liability, direction: "receipt" | "payment") {
    setSelectedLiabilityId(null);
    setLiabilityDraft(null);
    const isReceipt = direction === "receipt";
    const subType = liability.type === "Bank Loan"
      ? "bank_loan"
      : liability.type === "Shareholder Loan"
        ? "shareholder_loan"
        : "personal_loan";
    setTxFormInitial({
      purpose: loanPurpose(liability, direction),
      type: isReceipt ? "loan_receipt" : "loan_payment",
      subType,
      linkedLiabilityId: liability.id,
      tag: liability.tag,
      mode: "Bank Transfer",
      date: todayDateOnly(),
    });
    setTxFormTitle(isReceipt ? `Record Borrowing - ${liability.name}` : `Record Repayment - ${liability.name}`);
    setScheduledAmount(undefined);
    setTxFormOpen(true);
  }

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

    const ownedPropertyTaxItems: UpcomingItem[] = houseLoans
      .filter((loan) => loan.propertyTaxDate && (loan.propertyTaxAmount ?? 0) > 0)
      .map((loan) => ({
        kind: "housePropertyTax" as const,
        id: `house-tax-${loan.id}`,
        date: getNextOccurrence(loan.propertyTaxDate!, loan.propertyTaxSchedule ?? "Monthly") ?? loan.propertyTaxDate!,
        name: loan.name,
        amount: loan.propertyTaxAmount ?? 0,
        note: "Property tax",
        loan,
      }));

    return sortByDate([...vehicleItems, ...houseItems, ...ownedPropertyTaxItems, ...propertyItems]).slice(0, 8);
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
    const isFinanced = vehicle.vtype === "Finance";
    setTxFormTitle(isFinanced ? `Log Vehicle Finance Payment - ${vehicle.name}` : `Log Vehicle Payment - ${vehicle.name}`);
    setScheduledAmount(vehicle.payment);
    setPendingPropertyMark(null);
    setTxFormInitial({
      type: isFinanced ? "loan_payment" : "expense",
      subType: isFinanced ? "bank_loan" : undefined,
      amount: vehicle.payment,
      date: nextDate,
      description: isFinanced ? `Vehicle Finance Payment - ${vehicle.name}` : `Vehicle Lease Payment - ${vehicle.name}`,
      sourceId: vehicle.source || "",
      linkedVehicleId: vehicle.id,
      recurringOriginType: "vehicle",
      recurringOriginId: vehicle.id,
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
      linkedPropertyId: property.id,
      recurringOriginType: "property_tax",
      recurringOriginId: payment.id,
      mode: "Bank Transfer",
      tag: "Personal",
    });
    setTxFormOpen(true);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", marginBottom: 8, color: theme.colors.text }}>Assets & Liabilities</div>
          <div style={{ fontSize: 13, color: theme.colors.textSoft, maxWidth: 760, lineHeight: 1.5 }}>
            This is the unified command area for asset, debt, and net worth tracking. Detail views remain available while we fold more of the workflow into this hub.
          </div>
        </div>
        <div style={{ fontSize: 12, color: theme.colors.textSoft }}>
          Use the tabs above to jump into vehicle and house-loan details.
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatBox label="Liquid Assets" value={fmtCAD(liquidAssets)} color="#1a7f3c" sub="active bank and cash accounts" />
        <StatBox label="Tracked Liabilities" value={fmtCAD(totalLiabilities)} color="#a31515" sub="cards + mortgages + lender loans" />
        <StatBox label="Net Worth Snapshot" value={fmtCAD(netWorth)} color={netWorth >= 0 ? "#1a7f3c" : "#a31515"} sub="market values not modeled yet" />
        <StatBox label="Next 30 Days" value={fmtCAD(upcomingTotal30)} color="#a05c00" sub="upcoming obligations from this page" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <SectionCard
          title="Upcoming Obligations"
          accent="#a05c00"
          actions={undefined}
        >
          {upcomingObligations.length === 0 ? (
            <EmptyNote>No upcoming obligations are scheduled yet. Add next payment dates in the related detail views to make this page actionable.</EmptyNote>
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
                    {(item.kind === "house" || item.kind === "housePropertyTax") && null}
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
          actions={undefined}
        >
          {houseLoans.length === 0 && propertyTaxes.length === 0 ? (
            <EmptyNote>No real estate items yet. Use the House Loans detail view while this area absorbs more of that workflow.</EmptyNote>
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
                  {!!loan.propertyTaxAmount && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                      Property tax {fmtCAD(loan.propertyTaxAmount)}/{loan.propertyTaxSchedule ?? "Monthly"}
                      {loan.propertyTaxDate ? ` | Next ${fmtDate(getNextOccurrence(loan.propertyTaxDate, loan.propertyTaxSchedule ?? "Monthly") ?? loan.propertyTaxDate)}` : ""}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {houseLoans.filter((loan) => (loan.propertyTaxAmount ?? 0) > 0).length + propertyTaxes.length} property tax schedule{houseLoans.filter((loan) => (loan.propertyTaxAmount ?? 0) > 0).length + propertyTaxes.length === 1 ? "" : "s"} | unpaid planned tax {fmtCAD(unpaidPropertyTax)}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Direct mortgage logging stays in the House Loans detail view for now until principal vs interest handling is cleaner.
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Vehicles"
          accent="#1d4ed8"
          actions={<ActionBtn onClick={() => onNavigate("vehicles")}>Open Details</ActionBtn>}
        >
          {vehicles.length === 0 ? (
            <EmptyNote>No vehicles yet. Add leases and financed vehicles in the Vehicles detail view for now.</EmptyNote>
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
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <ActionBtn onClick={() => setShowLenderForm((value) => !value)}>Add Lender</ActionBtn>
              <ActionBtn onClick={() => setShowArchivedLiabilities((value) => !value)}>
                {showArchivedLiabilities ? "Hide Archived" : "Show Archived"}
              </ActionBtn>
              <ActionBtn onClick={() => onNavigate("cards")}>Credit Cards</ActionBtn>
            </div>
          }
        >
          {showLenderForm && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) minmax(140px, 180px) minmax(120px, 150px) auto", gap: 8, marginBottom: 14 }}>
              <input value={lenderName} onChange={(event) => setLenderName(event.target.value)} placeholder="Lender name" style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }} />
              <select value={lenderType} onChange={(event) => setLenderType(event.target.value as Liability["type"])} style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}>
                <option>Personal Loan</option>
                <option>Bank Loan</option>
                <option>Shareholder Loan</option>
              </select>
              <select value={lenderTag} onChange={(event) => setLenderTag(event.target.value as Liability["tag"])} style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}>
                <option>Personal</option>
                <option>Business</option>
              </select>
              <ActionBtn variant="green" onClick={() => {
                if (!lenderName.trim()) return;
                saveLiability({
                  name: lenderName.trim(),
                  type: lenderType,
                  openingBalance: 0,
                  tag: lenderTag,
                });
                setLenderName("");
                setShowLenderForm(false);
              }}>Save</ActionBtn>
            </div>
          )}
          {activeCards.length === 0 && houseLoans.length === 0 && visibleLiabilities.length === 0 ? (
            <EmptyNote>No liabilities tracked yet. Credit cards and house loans still live in their detail views during the transition.</EmptyNote>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>Credit cards owing: {fmtCAD(cardLiabilities)}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>House loans remaining: {fmtCAD(houseLoanLiabilities)}</div>
              {visibleLiabilities.map((liability) => (
                <div key={liability.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", paddingTop: 8, borderTop: "1px solid #f3f4f6", opacity: liability.archived ? 0.68 : 1 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{liability.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{liability.type} | {liability.tag}{liability.archived ? " | Archived" : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong>{fmtCAD(liabilityBalances[liability.id] ?? 0)} owed</strong>
                    <ActionBtn onClick={() => openLiabilityDetails(liability)}>Details</ActionBtn>
                    {!liability.archived && <ActionBtn onClick={() => openLiabilityTransaction(liability, "receipt")}>Borrow</ActionBtn>}
                    {!liability.archived && <ActionBtn variant="green" onClick={() => openLiabilityTransaction(liability, "payment")}>Repay</ActionBtn>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {selectedLiability && liabilityDraft && selectedLiabilitySummary && (
        <Modal title={`Lender - ${selectedLiability.name}`} onClose={closeLiabilityDetails}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <StatBox label="Current Owing" value={fmtCAD(selectedLiabilitySummary.currentBalance)} color="#a31515" />
            <StatBox label="Borrowed" value={fmtCAD(selectedLiabilitySummary.borrowed)} color="#1a5fa8" />
            <StatBox label="Principal Repaid" value={fmtCAD(selectedLiabilitySummary.principalRepaid)} color="#1a7f3c" />
            <StatBox label="Interest Paid" value={fmtCAD(selectedLiabilitySummary.interestPaid)} color="#a05c00" />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {!selectedLiability.archived && <ActionBtn onClick={() => openLiabilityTransaction(selectedLiability, "receipt")}>Borrow</ActionBtn>}
            {!selectedLiability.archived && <ActionBtn variant="green" onClick={() => openLiabilityTransaction(selectedLiability, "payment")}>Repay</ActionBtn>}
            {selectedLiability.archived && (
              <ActionBtn onClick={() => {
                const restored = saveLiability({ ...selectedLiability, archived: false });
                setLiabilityDraft(restored);
              }}>Restore Lender</ActionBtn>
            )}
            <ActionBtn variant="danger" onClick={() => archiveOrDeleteLiability(selectedLiability)}>
              {selectedLiabilitySummary.transactionCount > 0 ? "Archive" : "Delete"}
            </ActionBtn>
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginBottom: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Lender Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <label style={{ fontSize: 12, color: "#475569" }}>
                Name
                <input value={liabilityDraft.name} onChange={(event) => setLiabilityDraft({ ...liabilityDraft, name: event.target.value })} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }} />
              </label>
              <label style={{ fontSize: 12, color: "#475569" }}>
                Type
                <select value={liabilityDraft.type} onChange={(event) => setLiabilityDraft({ ...liabilityDraft, type: event.target.value as Liability["type"] })} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}>
                  <option>Personal Loan</option>
                  <option>Bank Loan</option>
                  <option>Shareholder Loan</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: "#475569" }}>
                Tag
                <select value={liabilityDraft.tag} onChange={(event) => setLiabilityDraft({ ...liabilityDraft, tag: event.target.value as Liability["tag"] })} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}>
                  <option>Personal</option>
                  <option>Business</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: "#475569" }}>
                Starting Balance ($)
                <input type="number" value={liabilityDraft.openingBalance} onChange={(event) => setLiabilityDraft({ ...liabilityDraft, openingBalance: Number(event.target.value) })} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }} />
              </label>
            </div>
            <label style={{ display: "block", fontSize: 12, color: "#475569", marginTop: 10 }}>
              Notes
              <textarea value={liabilityDraft.notes ?? ""} onChange={(event) => setLiabilityDraft({ ...liabilityDraft, notes: event.target.value })} rows={2} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box", resize: "vertical" }} />
            </label>

            <div style={{ fontWeight: 800, fontSize: 14, marginTop: 16, marginBottom: 8 }}>Balance Snapshot</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Use a known lender statement balance and date. Only later principal activity is replayed.</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(160px, 1fr) auto", gap: 10, alignItems: "end" }}>
              <label style={{ fontSize: 12, color: "#475569" }}>
                Known Owing ($)
                <input ref={snapshotAmountRef} type="number" value={liabilityDraft.balanceSnapshotAmount ?? ""} onChange={(event) => setLiabilityDraft({ ...liabilityDraft, balanceSnapshotAmount: event.target.value === "" ? undefined : Number(event.target.value) })} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }} />
              </label>
              <label style={{ fontSize: 12, color: "#475569" }}>
                Snapshot Date
                <input ref={snapshotDateRef} type="date" value={liabilityDraft.balanceSnapshotDate ?? ""} onChange={(event) => setLiabilityDraft({ ...liabilityDraft, balanceSnapshotDate: event.target.value || undefined })} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }} />
              </label>
              <ActionBtn onClick={() => setLiabilityDraft({ ...liabilityDraft, balanceSnapshotAmount: undefined, balanceSnapshotDate: undefined })}>Clear Snapshot</ActionBtn>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <ActionBtn variant="primary" onClick={saveLiabilityDraft}>Save Details</ActionBtn>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginBottom: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Attach Existing Loan Transaction</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={attachTransactionId} onChange={(event) => setAttachTransactionId(event.target.value)} style={{ flex: 1, minWidth: 240, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}>
                <option value="">-- Select unlinked loan transaction --</option>
                {unlinkedLoanTransactions.map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>
                    {transaction.date} | {transaction.description} | {fmtCAD(transaction.amount)}
                  </option>
                ))}
              </select>
              <ActionBtn onClick={attachSelectedTransaction}>Attach</ActionBtn>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Running Ledger</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {selectedLiability.balanceSnapshotDate ? `After snapshot ${selectedLiability.balanceSnapshotDate}` : "From starting balance"}
              </div>
            </div>
            {selectedLiabilityLedger.length === 0 ? (
              <EmptyNote>No linked principal activity after the current starting point.</EmptyNote>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                      <th style={{ padding: 8 }}>Date</th>
                      <th style={{ padding: 8 }}>Description</th>
                      <th style={{ padding: 8, textAlign: "right" }}>Principal Effect</th>
                      <th style={{ padding: 8, textAlign: "right" }}>Interest</th>
                      <th style={{ padding: 8, textAlign: "right" }}>Running Owing</th>
                      <th style={{ padding: 8 }}>Relink</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLiabilityLedger.map((row) => (
                      <tr key={row.transaction.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                        <td style={{ padding: 8, whiteSpace: "nowrap" }}>{row.transaction.date}</td>
                        <td style={{ padding: 8 }}>{row.transaction.description}</td>
                        <td style={{ padding: 8, textAlign: "right", color: row.effect >= 0 ? "#a31515" : "#1a7f3c", fontWeight: 700 }}>{row.effect >= 0 ? "+" : "-"}{fmtCAD(Math.abs(row.effect))}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>{row.interest > 0 ? fmtCAD(row.interest) : "-"}</td>
                        <td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>{fmtCAD(row.runningBalance)}</td>
                        <td style={{ padding: 8 }}>
                          <select
                            aria-label={`Relink ${row.transaction.description}`}
                            value={row.transaction.linkedLiabilityId ?? ""}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              const nextName = liabilities.find((liability) => liability.id === nextId)?.name ?? "no lender";
                              if (!confirm(`Relink ${row.transaction.description} to ${nextName}?`)) return;
                              relinkTransaction(row.transaction, nextId || undefined);
                            }}
                            style={{ padding: "5px 7px", border: "1px solid #d1d5db", borderRadius: 6 }}
                          >
                            <option value="">No lender</option>
                            {liabilities.filter((liability) => !liability.archived || liability.id === row.transaction.linkedLiabilityId).map((liability) => (
                              <option key={liability.id} value={liability.id}>{liability.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}

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
