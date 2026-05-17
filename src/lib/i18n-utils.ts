// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLocalizedText(jsonText: any, locale: string): string {
  if (!jsonText) return "";
  if (typeof jsonText === "string") return jsonText;
  
  if (typeof jsonText === "object" && !Array.isArray(jsonText)) {
    const textObj = jsonText as Record<string, any>;
    return (textObj[locale] as string) || (textObj['it'] as string) || "";
  }
  return "";
}

export function getLocalizedArray(jsonArray: any, locale: string): string[] {
  if (!jsonArray) return [];
  
  if (Array.isArray(jsonArray)) {
    return jsonArray.map(String);
  }
  
  if (typeof jsonArray === "object") {
    const arrayObj = jsonArray as Record<string, any>;
    return (arrayObj[locale] as string[]) || (arrayObj['it'] as string[]) || [];
  }
  return [];
}
