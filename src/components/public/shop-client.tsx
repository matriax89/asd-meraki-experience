"use client";

import { useState } from "react";
import { ProductCard } from "@/components/public/product-card";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/fade-in";
import { ShoppingBag, Search, Filter } from "lucide-react";

type ShopClientProps = {
  prodotti: any[];
};

export function ShopClient({ prodotti }: ShopClientProps) {
  const [activeCategoria, setActiveCategoria] = useState("Tutti");
  const [activeTipologia, setActiveTipologia] = useState("Tutte");
  const [activeTaglia, setActiveTaglia] = useState("Tutte");

  const availableCategorie = Array.from(new Set(prodotti.map(p => p.categoria))).filter(Boolean);
  const availableTipologie = Array.from(new Set(prodotti.map(p => p.sottocategoria))).filter(Boolean);
  const availableTaglie = Array.from(
    new Set(prodotti.flatMap(p => p.product_variants?.map((v: any) => v.taglia) || []))
  ).filter(Boolean).sort();

  const filteredProdotti = prodotti.filter((p) => {
    let matchCategoria = true;
    let matchTipologia = true;
    let matchTaglia = true;

    if (activeCategoria !== "Tutti") {
      matchCategoria = p.categoria === activeCategoria;
    }
    
    if (activeTipologia !== "Tutte") {
      matchTipologia = p.sottocategoria === activeTipologia;
    }

    if (activeTaglia !== "Tutte") {
      matchTaglia = p.product_variants && p.product_variants.some((v: any) => v.taglia === activeTaglia);
    }

    return matchCategoria && matchTipologia && matchTaglia;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mt-8">
      
      {/* Sidebar Desktop & Mobile Filters */}
      <aside className="w-full lg:w-1/4 xl:w-1/5 shrink-0">
        <div className="sticky top-32 space-y-8">
          
          {/* Categorie */}
          <div>
            <div className="flex items-center gap-2 mb-4 text-foreground font-bold text-lg">
              <Filter className="w-5 h-5" />
              <h2>Categorie</h2>
            </div>
            <div className="flex lg:flex-col flex-row flex-wrap gap-2 lg:gap-1">
              <button
                onClick={() => setActiveCategoria("Tutti")}
                className={`text-left px-4 py-2.5 rounded-xl font-medium transition-all duration-200 text-sm md:text-base ${
                  activeCategoria === "Tutti"
                    ? "bg-foreground text-background shadow-md"
                    : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                Tutti i prodotti
              </button>
              {availableCategorie.map((cat: any) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoria(cat)}
                  className={`text-left px-4 py-2.5 rounded-xl font-medium transition-all duration-200 text-sm md:text-base ${
                    activeCategoria === cat
                      ? "bg-foreground text-background shadow-md"
                      : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  {cat === "abbigliamento" ? "Abbigliamento" : cat === "accessori" ? "Accessori" : "Altro"}
                </button>
              ))}
            </div>
          </div>

          {/* Tipologia */}
          {availableTipologie.length > 0 && (
            <div>
              <h2 className="text-foreground font-bold text-lg mb-4">Tipologia</h2>
              <div className="flex lg:flex-col flex-row flex-wrap gap-2 lg:gap-1">
                <button
                  onClick={() => setActiveTipologia("Tutte")}
                  className={`text-left px-4 py-2.5 rounded-xl font-medium transition-all duration-200 text-sm md:text-base ${
                    activeTipologia === "Tutte"
                      ? "bg-foreground text-background shadow-md"
                      : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  Tutte le tipologie
                </button>
                {availableTipologie.map((tipo: any) => (
                  <button
                    key={tipo}
                    onClick={() => setActiveTipologia(tipo)}
                    className={`text-left px-4 py-2.5 rounded-xl font-medium transition-all duration-200 text-sm md:text-base ${
                      activeTipologia === tipo
                        ? "bg-foreground text-background shadow-md"
                        : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    {tipo}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Taglie */}
          {availableTaglie.length > 0 && (
            <div>
              <h2 className="text-foreground font-bold text-lg mb-4">Taglia</h2>
              <div className="flex flex-row flex-wrap gap-2">
                <button
                  onClick={() => setActiveTaglia("Tutte")}
                  className={`w-12 h-12 flex items-center justify-center rounded-xl font-bold transition-all duration-200 text-sm ${
                    activeTaglia === "Tutte"
                      ? "bg-foreground text-background shadow-md border border-foreground"
                      : "bg-white text-slate-500 border border-slate-200 hover:border-foreground hover:text-foreground"
                  }`}
                >
                  All
                </button>
                {availableTaglie.map((taglia: any) => (
                  <button
                    key={taglia}
                    onClick={() => setActiveTaglia(taglia)}
                    className={`w-12 h-12 flex items-center justify-center rounded-xl font-bold transition-all duration-200 text-sm ${
                      activeTaglia === taglia
                        ? "bg-foreground text-background shadow-md border border-foreground"
                        : "bg-white text-slate-500 border border-slate-200 hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {taglia}
                  </button>
                ))}
              </div>
            </div>
          )}

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
          <StaggerContainer key={`${activeCategoria}-${activeTipologia}-${activeTaglia}`} className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 md:gap-8 xl:gap-10">
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
