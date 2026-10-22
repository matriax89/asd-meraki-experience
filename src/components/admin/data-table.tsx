import React from "react";
import { DataTableView } from "./data-table-view";

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
  caption?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  searchable?: boolean;
}

type OptionProps = { children?: React.ReactNode; value?: unknown; defaultValue?: unknown };
function selectOptions(children: React.ReactNode): React.ReactElement<OptionProps>[] {
  return React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement<OptionProps>(child)) return [];
    return child.type === "option" ? [child] : child.type === "optgroup" || child.type === React.Fragment ? selectOptions(child.props.children) : [];
  });
}

function visibleText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  if (React.isValidElement<OptionProps>(node)) {
    const options = selectOptions(node.props.children);
    if (options.length) {
      const selected = node.props.value ?? node.props.defaultValue ?? options[0].props.value ?? visibleText(options[0].props.children);
      const values = new Set((Array.isArray(selected) ? selected : [selected]).map(String));
      return options.filter(option => values.has(String(option.props.value ?? visibleText(option.props.children)))).map(option => visibleText(option.props.children)).join(" ");
    }
    return visibleText(node.props.children);
  }
  return "";
}

// Render server-owned cell callbacks before passing the serializable table view
// to the client. This also works in existing client-rendered management lists.
export function DataTable<T>({ data, columns, keyExtractor, caption, searchPlaceholder, pageSize, searchable }: DataTableProps<T>) {
  const rows = data.map(item => {
    const cells = columns.map(column => column.cell ? column.cell(item) : column.accessorKey ? String(item[column.accessorKey] ?? "") : null);
    return { id: keyExtractor(item), cells, searchText: cells.map(visibleText).join(" ") };
  });
  return <DataTableView rows={rows} columns={columns.map(({ header, align }) => ({ header, align }))} caption={caption} searchPlaceholder={searchPlaceholder} initialPageSize={pageSize} searchable={searchable}/>;
}
