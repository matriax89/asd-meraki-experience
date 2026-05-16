"use client";

import { useState, useRef } from "react";
import { uploadImageAction } from "@/app/api/admin/upload/actions";
import { X, Upload, Loader2, ImagePlus } from "lucide-react";
import Image from "next/image";

interface MultiImageUploadProps {
  label?: string;
  value: string[];
  onChange: (urls: string[]) => void;
  folder?: string;
}

export function MultiImageUpload({ label, value, onChange, folder = "products" }: MultiImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Client-side validation for file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
          alert(`L'immagine ${file.name} è troppo grande. Il limite è 10MB.`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", folder);

        const result = await uploadImageAction(formData);
        if (result.success && result.url) {
          newUrls.push(result.url);
        } else {
          console.error("Failed to upload:", result.error);
          alert(`Errore caricamento ${file.name}: ${result.error}`);
        }
      }

      onChange([...value, ...newUrls]);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Errore durante l'upload.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = (indexToRemove: number) => {
    onChange(value.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="space-y-3">
      {label && <label className="text-sm font-semibold">{label}</label>}
      
      <div className="flex flex-wrap gap-4">
        {value.map((url, index) => (
          <div key={index} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Preview ${index}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-24 h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer flex flex-col items-center justify-center transition-colors relative"
        >
          {isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <ImagePlus className="w-6 h-6 text-muted-foreground mb-1" />
              <span className="text-[10px] text-muted-foreground font-medium">Aggiungi</span>
            </>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload} 
            accept="image/*" 
            multiple 
            className="hidden" 
          />
        </div>
      </div>
    </div>
  );
}
