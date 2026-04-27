"use client";

import { useState, useMemo } from "react";
import { useCategories } from "@/modules/categories/useCategories";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { Category } from "@/types/category";

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#6b7280", display: "block", marginBottom: 4 }}>{children}</label>;
}
function Inp({ label, value, onChange, placeholder }: { label?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input value={value} onChange={onChange} placeholder={placeholder}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13, boxSizing: "border-box" as const }} />
    </div>
  );
}
function Sel({ label, value, onChange, options }: { label?: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select value={value} onChange={onChange}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function Btn({ children, onClick, variant = "primary", small, disabled }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "amber"; small?: boolean; disabled?: boolean;
}) {
  const c = {
    primary: { bg: "#1a5fa8", color: "#fff" },
    secondary: { bg: "#f3f4f6", color: "#374151" },
    danger: { bg: "#fef2f2", color: "#a31515" },
    amber: { bg: "#fef3c7", color: "#a05c00" },
  }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, background: c.bg, color: c.color }}>{children}</button>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e4e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </div>
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
    addCategory(newName.trim(), newType);
    setNewName("");
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
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Categories</div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { label: "Active", value: activeCount },
          { label: "Expense", value: expCount, color: "#a31515" },
          { label: "Income", value: incCount, color: "#1a7f3c" },
          { label: "Archived", value: archivedCount, color: "#6b7280" },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, minWidth: 90, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: s.color ?? "#1a1a1a" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div style={{ background: "#fff", border: "1px solid #1a5fa8", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#1a5fa8", marginBottom: 10 }}>Add New Category</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <Inp label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Utilities" />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <Sel label="Type" value={newType} onChange={(e) => setNewType(e.target.value as typeof newType)} options={TYPE_OPTS} />
          </div>
          <Btn onClick={handleAdd}>Add</Btn>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {(["all", "expense", "income"] as const).map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none",
            cursor: "pointer", background: typeFilter === t ? "#1a5fa8" : "#f3f4f6",
            color: typeFilter === t ? "#fff" : "#374151",
          }}>
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button onClick={() => setShowArchived((p) => !p)} style={{
          padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none",
          cursor: "pointer", background: showArchived ? "#fef3c7" : "#f3f4f6",
          color: showArchived ? "#a05c00" : "#374151",
        }}>
          {showArchived ? "Hide Archived" : "Show Archived"}
        </button>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
          style={{ flex: 1, minWidth: 120, padding: "5px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 12, background: "#fff" }} />
      </div>

      {/* Category list */}
      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, overflow: "hidden" }}>
        {filtered.map((cat) => {
          const txCount = txCountMap[cat.id] ?? 0;
          const isHovered = hoveredId === cat.id;
          return (
            <div key={cat.id}
              onMouseEnter={() => setHoveredId(cat.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", borderBottom: "1px solid #f3f4f6",
                background: cat.archived ? "#fafafa" : "transparent",
                opacity: cat.archived ? 0.7 : 1,
              }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 500, fontSize: 13, color: cat.archived ? "#9ca3af" : "#1a1a1a" }}>
                  {cat.name}
                </span>
                {cat.archived && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: "#f3f4f6", color: "#6b7280", padding: "1px 7px", borderRadius: 99 }}>ARCHIVED</span>
                )}
                {/* Transaction count — show on hover */}
                {isHovered && txCount > 0 && (
                  <span style={{ fontSize: 11, color: "#6b7280", background: "#f0f9ff", padding: "2px 8px", borderRadius: 99, border: "1px solid #bae6fd" }}>
                    {txCount} transaction{txCount !== 1 ? "s" : ""}
                  </span>
                )}
                {isHovered && txCount === 0 && (
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>no transactions</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{
                  padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                  background: cat.type === "income" ? "#dcfce7" : cat.type === "both" ? "#dbeafe" : "#fee2e2",
                  color: cat.type === "income" ? "#1a7f3c" : cat.type === "both" ? "#1a5fa8" : "#a31515",
                }}>{cat.type}</span>

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
          <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No categories found.</div>
        )}
      </div>

      {/* Edit modal */}
      {editCat && (
        <Modal title="Edit Category" onClose={() => setEditCat(null)}>
          <div style={{ background: "#fef3c7", padding: "8px 12px", borderRadius: 8, fontSize: 12, color: "#a05c00" }}>
            Renaming keeps all existing transactions linked — only the display name changes.
          </div>
          <Inp label="Name" value={editCat.name} onChange={(e) => setEditCat((p) => p ? { ...p, name: e.target.value } : p)} />
          <Sel label="Type" value={editCat.type} onChange={(e) => setEditCat((p) => p ? { ...p, type: e.target.value as Category["type"] } : p)} options={TYPE_OPTS} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setEditCat(null)}>Cancel</Btn>
            <Btn onClick={handleSaveEdit}>Save Changes</Btn>
          </div>
        </Modal>
      )}

      {/* Archive confirmation modal — shown when deleting a category with transactions */}
      {deleteConfirm && (
        <Modal title={`Archive "${deleteConfirm.name}"?`} onClose={() => setDeleteConfirm(null)}>
          <div style={{ background: "#fef3c7", padding: "10px 12px", borderRadius: 8, fontSize: 13, color: "#a05c00" }}>
            <strong>{txCountMap[deleteConfirm.id] ?? 0} transaction{(txCountMap[deleteConfirm.id] ?? 0) !== 1 ? "s" : ""} are linked</strong> to this category.
            It cannot be deleted but can be archived — it will be hidden from new entry dropdowns while all existing transactions remain intact.
          </div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
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