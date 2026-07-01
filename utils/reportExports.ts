export type ReportCell = string | number | boolean | null | undefined;

export interface ReportSheet {
  name: string;
  rows: Array<Record<string, ReportCell>>;
}

function safeSheetName(name: string) {
  return name.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Report";
}

function downloadBytes(bytes: BlobPart, mimeType: string, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function buildExcelWorkbookBuffer(sheets: ReportSheet[]): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FinanceOS";
  workbook.created = new Date();

  sheets.forEach((sheet) => {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name));
    const headers = Array.from(new Set(sheet.rows.flatMap((row) => Object.keys(row))));
    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.min(42, Math.max(12, header.length + 2)),
    }));
    sheet.rows.forEach((row) => worksheet.addRow(row));
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A5FA8" } };
    headerRow.alignment = { vertical: "middle" };
    worksheet.autoFilter = headers.length ? { from: "A1", to: `${worksheet.getColumn(headers.length).letter}1` } : undefined;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
      });
    });
  });

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function buildPdfArrayBuffer(
  title: string,
  sheets: ReportSheet[]
): Promise<ArrayBuffer> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  sheets.forEach((sheet, index) => {
    if (index > 0) document.addPage();
    document.setFontSize(16);
    document.text(index === 0 ? title : sheet.name, 36, 34);
    if (index === 0) {
      document.setFontSize(9);
      document.text(`Generated ${new Date().toLocaleString()} | Working papers only - review before filing`, 36, 50);
    }
    const headers = Array.from(new Set(sheet.rows.flatMap((row) => Object.keys(row))));
    const body = sheet.rows.map((row) => headers.map((header) => {
      const value = row[header];
      return typeof value === "number" ? value.toFixed(2) : String(value ?? "");
    }));
    autoTable(document, {
      startY: index === 0 ? 62 : 48,
      head: [headers],
      body,
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [26, 95, 168] },
      margin: { left: 28, right: 28 },
      showHead: "everyPage",
    });
  });

  return document.output("arraybuffer");
}

export async function exportReportsExcel(sheets: ReportSheet[], filename: string) {
  const bytes = await buildExcelWorkbookBuffer(sheets);
  downloadBytes(copyToArrayBuffer(bytes), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
}

export async function exportReportsPdf(title: string, sheets: ReportSheet[], filename: string) {
  const bytes = await buildPdfArrayBuffer(title, sheets);
  downloadBytes(bytes, "application/pdf", filename);
}
