const fs = require('fs-extra');
const path = require('path');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer');

class PurePDFConverter {
  constructor() {
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  async convertWordToPDF(wordPath, outputPath = null) {
    try {
      if (!await fs.pathExists(wordPath)) {
        throw new Error(`Arquivo Word não encontrado: ${wordPath}`);
      }

      console.log(`Convertendo: ${path.basename(wordPath)}`);
      
      const htmlContent = await this.convertWordToHTML(wordPath);
      const pdfBuffer = await this.convertHTMLToPDF(htmlContent);
      
      if (!outputPath) {
        const baseName = path.basename(wordPath, path.extname(wordPath));
        outputPath = path.join(path.dirname(wordPath), `${baseName}.pdf`);
      }
      
      await fs.writeFile(outputPath, pdfBuffer);
      
      return {
        path: outputPath,
        buffer: pdfBuffer,
        size: pdfBuffer.length
      };
    } catch (error) {
      throw new Error(`Falha na conversão para PDF: ${error.message}`);
    }
  }

  async convertWordToHTML(wordPath) {
    try {
      const wordBuffer = await fs.readFile(wordPath);
      const result = await mammoth.convertToHtml({ buffer: wordBuffer });
      
      const styledHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: 'Times New Roman', serif;
              font-size: 12pt;
              line-height: 1.15;
              margin: 1in;
              color: #000;
            }
            p {
              margin: 0 0 6pt 0;
              text-align: justify;
            }
            img {
              max-width: 200px;
              max-height: 80px;
              display: block;
              margin: -5px auto 0 auto;
              position: relative;
              z-index: 2;
            }
            strong {
              font-weight: bold;
            }
            em {
              font-style: italic;
            }
            u {
              text-decoration: underline;
            }
            .signature-line {
              border-bottom: 1px solid #000;
              width: 200px;
              height: 20px;
              display: inline-block;
              margin: 0 10px;
            }
          </style>
        </head>
        <body>
          ${result.value}
        </body>
        </html>
      `;
      
      return styledHTML;
    } catch (error) {
      throw new Error(`Erro na conversão Word→HTML: ${error.message}`);
    }
  }

  async convertHTMLToPDF(htmlContent) {
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in'
        },
        printBackground: true,
        preferCSSPageSize: true
      });
      
      await page.close();
      
      return pdfBuffer;
    } catch (error) {
      throw new Error(`Erro na conversão HTML→PDF: ${error.message}`);
    }
  }

  async validatePDFOutput(pdfPath) {
    try {
      const stats = await fs.stat(pdfPath);
      
      if (stats.size < 1000) {
        throw new Error('PDF gerado muito pequeno');
      }
      
      const buffer = await fs.readFile(pdfPath, { start: 0, end: 4 });
      if (!buffer.toString().startsWith('%PDF')) {
        throw new Error('Arquivo não é um PDF válido');
      }
      
      return { valid: true, size: stats.size, path: pdfPath };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async checkAvailability() {
    try {
      const browser = await this.initBrowser();
      await browser.close();
      this.browser = null;
      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: error.message,
        suggestion: 'Puppeteer não disponível'
      };
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = PurePDFConverter;