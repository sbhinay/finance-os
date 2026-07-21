"use client";

import { useState, useMemo } from "react";
import { useCategories } from "@/modules/categories/useCategories";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { Category } from "@/types/category";
import { ActionButton, EmptyState, MetricCard, MetricGrid, PageHeader, StatusChip, SurfaceCard, Toolbar } from "@/components/ui";
import { theme } from "@/lib/theme";

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0, textTransform: "uppercase" as const, color: theme.colors.textSoft, display: "block", marginBottom: 4 }}>{children}</label>;
}
function Inp({ label, value, onChange, placeholder }: { label?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input value={value} onChange={onChange} placeholder={placeholder}
        style={{ width: "100%", padding: "8px 10px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: theme.colors.surface, fontSize: 13, boxSizing: "border-box" as const }} />
    </div>
  );
}
function Sel({ label, value, onChange, options }: { label?: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select value={value} onChange={onChange}
        style={{ width: "100%", padding: "8px 10px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: theme.colors.surface, fontSize: 13 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: theme.colors.text, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
function Btn({ children, onClick, variant = "primary", small, disabled }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "amber"; small?: boolean; disabled?: boolean;
}) {
  const tone = variant === "amber" ? "warning" : variant;
  return <ActionButton tone={tone} compact={small} onClick={onClick} disabled={disabled}>{children}</ActionButton>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <SurfaceCard style={{ width: "100%", maxWidth: 460, boxShadow: theme.shadow.shell, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${theme.colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: theme.colors.surface }}>
          <div style={{ fontWeight: 750, fontSize: 15, color: theme.colors.text }}>{title}</div>
          <button onClick={onClose} className="finance-button" style={{ background: "transparent", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.pill, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: theme.colors.textSoft }}>Close</button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </SurfaceCard>
    </div>
  );
}

const TYPE_OPTS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "both", label: "Both" },
];

export function CategoriesSection() {
  const { categories, addCategory, updateCategory, deleteCategory, unarchiveCategory } = useCategories();
  const { transactions } = useTransactions();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense" | "both">("expense");
  const [newVehicleLinked, setNewVehicleLinked] = useState(false);
  const [newPropertyLinked, setNewPropertyLinked] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null);

  // Count transactions per category
  const txCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      if (t.categoryId) map[t.categoryId] = (map[t.categoryId] ?? 0) + 1;
    });
    return map;
  }, [transactions]);

  function handleAdd() {
    if (!newName.trim()) return;
    addCategory(newName.trim(), newType, {
      vehicleLinked: newVehicleLinked,
      propertyLinked: newPropertyLinked,
    });
    setNewName("");
    setNewVehicleLinked(false);
    setNewPropertyLinked(false);
  }

  function handleSaveEdit() {
    if (!editCat || !editCat.name.trim()) return;
    updateCategory(editCat);
    setEditCat(null);
  }

  function handleDelete(cat: Category) {
    const count = txCountMap[cat.id] ?? 0;
    if (count > 0) {
      setDeleteConfirm(cat);
    } else {
      if (confirm(`Delete "${cat.name}"? It has no linked transactions.`)) {
        deleteCategory(cat.id, 0);
      }
    }
  }

  const filtered = categories
    .filter((c) => showArchived ? true : !c.archived)
    .filter((c) => typeFilter === "all" || c.type === typeFilter || c.type === "both")
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.archived && !b.archived) return 1;
      if (!a.archived && b.archived) return -1;
      return a.name.localeCompare(b.name);
    });

  const activeCount = categories.filter((c) => !c.archived).length;
  const archivedCount = categories.filter((c) => c.archived).length;
  const expCount = categories.filter((c) => !c.archived && (c.type === "expense" || c.type === "both")).length;
  const incCount = categories.filter((c) => !c.archived && (c.type === "income" || c.type === "both")).length;

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Manage reporting categories and linked prompts for vehicles, properties, and transaction forms."
      />

      {/* Stats */}
      <MetricGrid>
        <MetricCard label="Active" value={String(activeCount)} />
        <MetricCard label="Expense" value={String(expCount)} color={theme.colors.danger} />
        <MetricCard label="Income" value={String(incCount)} color={theme.colors.success} />
        <MetricCard label="Archived" value={String(archivedCount)} color={theme.colors.textSoft} />
      </MetricGrid>

      {/* Add new */}
      <SurfaceCard accent={theme.colors.primary} style={{ padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 750, fontSize: 13, color: theme.colors.primary, marginBottom: 10 }}>Add New Category</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <Inp label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Utilities" />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <Sel label="Type" value={newType} onChange={(e) => setNewType(e.target.value as typeof newType)} options={TYPE_OPTS} />
          </div>
          <Btn onClick={handleAdd}>Add</Btn>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
          <Check label="Ask for vehicle details" checked={newVehicleLinked} onChange={setNewVehicleLinked} />
          <Check label="Ask for property details" checked={newPropertyLinked} onChange={setNewPropertyLinked} />
        </div>
      </SurfaceCard>

      {/* Filters */}
      <Toolbar style={{ marginBottom: 12 }}>
        {(["all", "expense", "income"] as const).map((t) => (
          <ActionButton key={t} compact tone={typeFilter === t ? "primary" : "secondary"} onClick={() => setTypeFilter(t)}>
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </ActionButton>
        ))}
        <ActionButton compact tone={showArchived ? "warning" : "secondary"} onClick={() => setShowArchived((p) => !p)}>
          {showArchived ? "Hide Archived" : "Show Archived"}
        </ActionButton>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
          style={{ flex: 1, minWidth: 120, padding: "7px 10px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, fontSize: 12, background: theme.colors.surface }} />
      </Toolbar>

      {/* Category list */}
      <SurfaceCard style={{ overflow: "hidden" }}>
        {filtered.map((cat) => {
          const txCount = txCountMap[cat.id] ?? 0;
          const isHovered = hoveredId === cat.id;
          return (
            <div key={cat.id}
              onMouseEnter={() => setHoveredId(cat.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "11px 14px", borderBottom: `1px solid ${theme.colors.border}`,
                background: cat.archived ? theme.colors.surfaceAlt : "transparent",
                opacity: cat.archived ? 0.7 : 1,
              }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 650, fontSize: 13, color: cat.archived ? theme.colors.textMuted : theme.colors.text }}>
                  {cat.name}
                </span>
                {cat.archived && (
                  <StatusChip tone="secondary">Archived</StatusChip>
                )}
                {cat.vehicleLinked && (
                  <StatusChip tone="primary">Vehicle</StatusChip>
                )}
                {cat.propertyLinked && (
                  <StatusChip tone="success">Property</StatusChip>
                )}
                {/* Transaction count - show on hover */}
                {isHovered && txCount > 0 && (
                  <span style={{ fontSize: 11, color: theme.colors.textSoft, background: "#f0f9ff", padding: "2px 8px", borderRadius: theme.radius.pill, border: "1px solid #bae6fd" }}>
                    {txCount} transaction{txCount !== 1 ? "s" : ""}
                  </span>
                )}
                {isHovered && txCount === 0 && (
                  <span style={{ fontSize: 11, color: theme.colors.textMuted }}>no transactions</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusChip tone={cat.type === "income" ? "success" : cat.type === "both" ? "primary" : "danger"}>{cat.type}</StatusChip>

                {cat.archived ? (
                  <Btn variant="secondary" small onClick={() => unarchiveCategory(cat.id)}>Unarchive</Btn>
                ) : (
                  <>
                    <Btn variant="secondary" small onClick={() => setEditCat({ ...cat })}>Edit</Btn>
                    <Btn variant="danger" small onClick={() => handleDelete(cat)}>
                      {txCount > 0 ? "Archive" : "Delete"}
                    </Btn>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState title="No categories found." />
        )}
      </SurfaceCard>

      {/* Edit modal */}
      {editCat && (
        <Modal title="Edit Category" onClose={() => setEditCat(null)}>
          <SurfaceCard style={{ background: theme.colors.warningSoft, padding: "8px 12px", fontSize: 12, color: theme.colors.warning }}>
            Renaming keeps all existing transactions linked - only the display name changes.
          </SurfaceCard>
          <Inp label="Name" value={editCat.name} onChange={(e) => setEditCat((p) => p ? { ...p, name: e.target.value } : p)} />
          <Sel label="Type" value={editCat.type} onChange={(e) => setEditCat((p) => p ? { ...p, type: e.target.value as Category["type"] } : p)} options={TYPE_OPTS} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: "10px 12px", background: theme.colors.surfaceAlt }}>
            <Check label="Ask for vehicle details" checked={!!editCat.vehicleLinked} onChange={(checked) => setEditCat((p) => p ? { ...p, vehicleLinked: checked || undefined } : p)} />
            <Check label="Ask for property details" checked={!!editCat.propertyLinked} onChange={(checked) => setEditCat((p) => p ? { ...p, propertyLinked: checked || undefined } : p)} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setEditCat(null)}>Cancel</Btn>
            <Btn onClick={handleSaveEdit}>Save Changes</Btn>
          </div>
        </Modal>
      )}

      {/* Archive confirmation modal - shown when deleting a category with transactions */}
      {deleteConfirm && (
        <Modal title={`Archive "${deleteConfirm.name}"?`} onClose={() => setDeleteConfirm(null)}>
          <SurfaceCard style={{ background: theme.colors.warningSoft, padding: "10px 12px", fontSize: 13, color: theme.colors.warning }}>
            <strong>{txCountMap[deleteConfirm.id] ?? 0} transaction{(txCountMap[deleteConfirm.id] ?? 0) !== 1 ? "s" : ""} are linked</strong> to this category.
            It cannot be deleted but can be archived - it will be hidden from new entry dropdowns while all existing transactions remain intact.
          </SurfaceCard>
          <div style={{ fontSize: 13, color: theme.colors.textSoft }}>
            You can unarchive it anytime to restore it to dropdowns.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
            <Btn variant="amber" onClick={() => {
              deleteCategory(deleteConfirm.id, txCountMap[deleteConfirm.id] ?? 0);
              setDeleteConfirm(null);
            }}>Archive Category</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
