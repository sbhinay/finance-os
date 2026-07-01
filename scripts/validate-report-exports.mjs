import { buildExcelWorkbookBuffer, buildPdfArrayBuffer } from "../utils/reportExports.ts";

const sheets = [
  {
    name: "Tax Working Papers",
    rows: [
      {
        Item: "Vehicle",
        "Bookkeeping Amount": 100,
        "Tax Treatment Status": "proposed",
        Confidence: "Medium",
      },
    ],
  },
  {
    name: "Missing Information",
    rows: [{ Status: "Missing", Item: "Business-use percentage" }],
  },
];

const excel = await buildExcelWorkbookBuffer(sheets);
if (excel[0] !== 0x50 || excel[1] !== 0x4b || excel.length < 1000) {
  throw new Error("Excel export did not produce a valid XLSX/ZIP payload.");
}

const pdf = new Uint8Array(await buildPdfArrayBuffer("FinanceOS Validation", sheets));
const signature = new TextDecoder().decode(pdf.slice(0, 4));
if (signature !== "%PDF" || pdf.length < 1000) {
  throw new Error("PDF export did not produce a valid PDF payload.");
}

console.log(`Report exports validated: ${excel.length} byte XLSX and ${pdf.length} byte PDF.`);
