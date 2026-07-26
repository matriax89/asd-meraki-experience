/**
 * Compresses an image file and converts it to WebP format using HTML5 Canvas.
 * 
 * @param file The original image file
 * @param maxWidth The maximum width of the resulting image
 * @param quality The quality of the WebP compression (0 to 1)
 * @returns A Promise that resolves to the compressed WebP File
 */
export async function compressImageToWebp(
  file: File,
  maxWidth: number = 2560,
  quality: number = 0.9
): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error("File provided is not an image"));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas to WebP Blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas to Blob failed"));
              return;
            }
            
            // Create a new File object from the Blob
            const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
            const newFile = new File([blob], newFileName, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            
            resolve(newFile);
          },
          "image/webp",
          quality
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

export async function convertImageToPng(file: File, size: number = 512): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith("image/")) {
      reject(new Error("File provided is not an image"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Failed to get canvas context"));
        const scale = Math.min(size / img.width, size / img.height);
        const width = img.width * scale;
        const height = img.height * scale;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Canvas to Blob failed"));
          resolve(new File([blob], `${file.name.replace(/\.[^/.]+$/, "")}.png`, {
            type: "image/png",
            lastModified: Date.now(),
          }));
        }, "image/png");
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
