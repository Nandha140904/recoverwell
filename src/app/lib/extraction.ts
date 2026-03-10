import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";

// Fix for PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Extracts text from a PDF or Image.
 * If a PDF has no extractable text, it renders pages as images and uses OCR.
 */
export async function extractTextFromMedicalFile(file: File): Promise<string> {
  const mimeType = file.type || getFallbackMimeType(file.name);
  
  if (mimeType === "application/pdf") {
    return extractFromPDF(file);
  } else if (mimeType.startsWith("image/")) {
    return extractFromImage(file);
  }
  
  throw new Error("Unsupported file type for medical extraction. Please use PDF or an Image.");
}

function getFallbackMimeType(fileName: string): string {
  if (fileName.endsWith(".pdf")) return "application/pdf";
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "image/jpeg";
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  return "";
}

async function extractFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  
  // 1. Try standard text extraction
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n";
  }
  
  // 2. If extracted text is very sparse, it's likely a scanned PDF. Fallback to OCR.
  // Threshold: less than 10 words per page on average might indicate a scan
  const wordCount = fullText.split(/\s+/).filter(w => w.length > 1).length;
  if (wordCount < pdf.numPages * 5) {
    console.log("[Extraction] Standard PDF extraction yielded little text. Falling back to OCR...");
    return ocrPDFPages(pdf);
  }
  
  return fullText.trim();
}

async function ocrPDFPages(pdf: pdfjsLib.PDFDocumentProxy): Promise<string> {
  let ocrResult = "";
  
  // We'll OCR the first 3 pages at most to save time/resources, 
  // most medical docs are short.
  const maxPages = Math.min(pdf.numPages, 3);
  
  const worker = await createWorker("eng");
  
  for (let i = 1; i <= maxPages; i++) {
    console.log(`[Extraction] OCRing page ${i}...`);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
    
    // Create canvas to render page
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    
    // Convert canvas to image data URL
    const imageData = canvas.toDataURL("image/png");
    
    // OCR the image
    const { data: { text } } = await worker.recognize(imageData);
    ocrResult += text + "\n";
    
    // Clean up
    canvas.remove();
  }
  
  await worker.terminate();
  return ocrResult.trim();
}

async function extractFromImage(file: File): Promise<string> {
  console.log("[Extraction] Running OCR on Image...");
  const worker = await createWorker("eng");
  
  const reader = new FileReader();
  const imageData: string = await new Promise((resolve) => {
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
  
  const { data: { text } } = await worker.recognize(imageData);
  await worker.terminate();
  
  return text.trim();
}
