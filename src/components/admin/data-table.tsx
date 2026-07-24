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
    <div className="w-full overflow-x-auto rounded-[22px] border border-black/[0.07] bg-white shadow-[0_16px_50px_rgba(24,27,20,.04)]">
      <table className="w-full text-sm text-left">
        <thead className="border-b border-black/[0.06] bg-[#f7f7f3]">
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={`px-5 py-4 text-[10px] font-extrabold text-black/40 uppercase tracking-[0.14em] whitespace-nowrap ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.055]">
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
                className="hover:bg-[#f7f7f3] transition-colors"
              >
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className={`px-5 py-4 text-[#34362f] ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}>
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
