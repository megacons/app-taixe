/**
 * Utility: tạo workbook ExcelJS đã được cấu hình đúng để mở được trên mọi máy
 * - Đặt font mặc định Calibri (phổ biến nhất, có sẵn mọi OS)
 * - Đặt creator, lastModifiedBy để Excel nhận dạng đúng
 * - saveAsExcel: lưu với MIME type đúng cho xlsx
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Tạo workbook với cấu hình chuẩn */
export function createWorkbook(sheetName: string): { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet } {
  const wb = new ExcelJS.Workbook();

  // Metadata — giúp Excel nhận dạng file đúng
  wb.creator  = 'Nam Thanh Transport';
  wb.lastModifiedBy = 'Nam Thanh Transport';
  wb.created  = new Date();
  wb.modified = new Date();

  // Font mặc định toàn workbook — Calibri 11 có sẵn trên Windows, Mac, Linux
  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 1, visibility: 'visible' }];

  const ws = wb.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ state: 'normal' }],
  });

  return { wb, ws };
}

/** Lưu workbook thành file .xlsx với MIME type đúng */
export async function saveWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: XLSX_MIME }),
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  );
}

/** Style chuẩn cho header row */
export const HEADER_STYLE = {
  navyBlue: {
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163797' } } as ExcelJS.Fill,
    font:      { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' } as ExcelJS.Font,
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } as ExcelJS.Alignment,
    border:    { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } as ExcelJS.Borders,
  },
  yellow: {
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } } as ExcelJS.Fill,
    font:      { bold: true, color: { argb: 'FF1F3864' }, size: 11, name: 'Calibri' } as ExcelJS.Font,
    alignment: { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment,
    border:    { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } as ExcelJS.Borders,
  },
};

/** Áp dụng style lên 1 row header */
export function applyHeaderRow(row: ExcelJS.Row, style: typeof HEADER_STYLE['navyBlue']): void {
  row.height = 22;
  row.eachCell(cell => {
    cell.fill      = style.fill;
    cell.font      = style.font;
    cell.alignment = style.alignment;
    cell.border    = style.border;
  });
}

/** Style zebra stripe cho data row */
export function dataCellStyle(cell: ExcelJS.Cell, colIndex: number, rowIndex: number): void {
  const bg = rowIndex % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FF';
  cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  cell.border = {
    top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
    right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
  };
  cell.font = { name: 'Calibri', size: 11 };
}

/** Style cho dòng tổng cộng */
export function applyTotalRow(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE599' } };
    cell.font   = { bold: true, size: 11, name: 'Calibri' };
    cell.border = {
      top:    { style: 'medium' },
      bottom: { style: 'medium' },
      left:   { style: 'thin' },
      right:  { style: 'thin' },
    };
  });
}

/** numFmt tiền VNĐ - tương thích mọi locale */
export const VND_FMT = '#,##0';
