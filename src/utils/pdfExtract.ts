import * as pdfjsLib from 'pdfjs-dist';

// Set up the Global Worker Options for pdfjs-dist
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/**
 * Extracts plain text from a PDF File in the browser using pdfjs-dist.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          reject(new Error('Empty PDF file'));
          return;
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        const pageTextPromises: Promise<string>[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          pageTextPromises.push(
            pdf.getPage(i).then(async (page) => {
              const tokenContent = await page.getTextContent();
              const pageStrings = tokenContent.items
                .map((item: any) => item.str)
                .filter((str: string) => str.trim().length > 0);
              
              // Group items into a section heading if page 1 or page breaks
              const pageContent = pageStrings.join(' ');
              return page.pageNumber === 1 ? pageContent : `\n\n## Page ${page.pageNumber}\n\n${pageContent}`;
            })
          );
        }

        const pages = await Promise.all(pageTextPromises);
        const fullText = pages.join('\n\n');

        if (!fullText.trim()) {
          reject(new Error('No readable text found in PDF (it might be a scanned image-only PDF).'));
          return;
        }

        resolve(fullText);
      } catch (err: any) {
        reject(new Error('Failed to parse PDF document: ' + (err?.message || 'Unknown error')));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(file);
  });
}
