import React from "react";

interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
}

export function DataTable<T>({ data, columns, keyExtractor }: DataTableProps<T>) {
  return (
    <div className="w-full overflow-x-auto rounded-[8px] border border-slate-200 bg-white shadow-none">
      <table className="w-full text-sm text-left">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={`px-3 py-2.5 text-[10px] font-medium text-slate-500 whitespace-nowrap ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-16 text-center text-black/35 font-semibold">
                Nessun dato disponibile.
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr 
                key={keyExtractor(item)} 
                className="hover:bg-slate-50 transition-colors"
              >
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className={`px-3 py-2.5 text-[12px] text-slate-950 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}>
                    {col.cell 
                      ? col.cell(item) 
                      : col.accessorKey 
                        ? String(item[col.accessorKey] ?? '') 
                        : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
