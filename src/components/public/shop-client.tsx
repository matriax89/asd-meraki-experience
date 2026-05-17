"use client";

import { useState } from "react";
import { ProductCard } from "@/components/public/product-card";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/fade-in";
import { ShoppingBag, Search, Filter } from "lucide-react";

type ShopClientProps = {
  prodotti: any[];
};

export function ShopClient({ prodotti }: ShopClientProps) {
  const [activeFilter, setActiveFilter] = useState("Tutti");

  const availableCategories = Array.from(new Set(prodotti.map(p => p.categoria))).filter(Boolean);
  const dynamicFilters = [
    { id: "Tutti", label: "Tutti" },
    ...availableCategories.map(cat => ({
      id: cat as string,
      label: cat === "abbigliamento" ? "Abbigliamento" : cat === "accessori" ? "Accessori" : "Altro"
    }))
  ];

  const filteredProdotti = prodotti.filter((p) => {
    if (activeFilter === "Tutti") return true;
    return p.categoria === activeFilter;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mt-8">
      
      {/* Sidebar Desktop & Mobile Filters */}
      <aside className="w-full lg:w-1/4 xl:w-1/5 shrink-0">
        <div className="sticky top-32">
          <div className="flex items-center gap-2 mb-6 text-foreground font-bold text-lg">
            <Filter className="w-5 h-5" />
            <h2>Filtri</h2>
          </div>
          
          <div className="flex lg:flex-col flex-row flex-wrap gap-2 lg:gap-1">
            {dynamicFilters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`text-left px-4 py-2.5 rounded-xl font-medium transition-all duration-200 text-sm md:text-base ${
                  activeFilter === filter.id
                    ? "bg-foreground text-background shadow-md"
                    : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Grid Container */}
      <div className="flex-1">
        <div className="mb-6 flex justify-between items-center">
          <p className="text-muted-foreground text-sm font-medium">
            Trovati <span className="text-foreground font-bold">{filteredProdotti.length}</span> prodotti
          </p>
        </div>

        {filteredProdotti.length > 0 ? (
          <StaggerContainer key={activeFilter} className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 md:gap-8 xl:gap-10">
            {filteredProdotti.map((prodotto) => (
              <StaggerItem key={prodotto.id} className="h-full">
                <ProductCard {...prodotto} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        ) : (
          <FadeIn className="text-center py-20 rounded-[2rem] border border-dashed border-border bg-secondary/10">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-bold mb-2">Nessun prodotto trovato</h3>
            <p className="text-sm text-muted-foreground">Prova a cambiare il filtro per vedere altri risultati.</p>
          </FadeIn>
        )}
      </div>
      
    </div>
  );
}
