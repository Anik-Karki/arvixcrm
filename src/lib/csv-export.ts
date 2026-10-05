/**
 * CSV export utility — converts an array of objects to a downloadable CSV file.
 *
 * Usage:
 *   downloadCSV("activity-logs.csv", logs, [
 *     { header: "Time",        accessor: (l) => new Date(l.created_at).toLocaleString() },
 *     { header: "User",        accessor: (l) => l.user_email ?? "" },
 *     { header: "Action",      accessor: (l) => l.action },
 *     { header: "Entity",      accessor: (l) => l.entity_type ?? "" },
 *     { header: "Entity Name", accessor: (l) => l.entity_name ?? "" },
 *   ]);
 */

interface CSVColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

export function downloadCSV<T>(filename: string, rows: T[], columns: CSVColumn<T>[]) {
  // Build header row
  const headerLine = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(",");

  // Build data rows
  const dataLines = rows.map(row =>
    columns.map(col => {
      const val = col.accessor(row);
      const str = val === null || val === undefined ? "" : String(val);
      // Escape quotes and wrap in quotes
      return `"${str.replace(/"/g, '""')}"`;
    }).join(",")
  );

  const csv = [headerLine, ...dataLines].join("\n");

  // Create blob and trigger download
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
