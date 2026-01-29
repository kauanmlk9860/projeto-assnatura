const fs = require('fs-extra');
const path = require('path');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer');

class PurePDFConverter {
  constructor() {
    this.browser = null;
    this.pagePool = [];
    this.maxPages = 3; // Pool de páginas para processamento paralelo
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-extensions'
        ]
      });
      
      // Pré-criar pool de páginas
      for (let i = 0; i < this.maxPages; i++) {
        const page = await this.browser.newPage();
        this.pagePool.push(page);
      }
      
      console.log(`Browser inicializado com pool de ${this.maxPages} páginas`);
    }
    return this.browser;
  }

  async getPage() {
    await this.initBrowser();
    
    if (this.pagePool.length > 0) {
      const page = this.pagePool.pop();
      // Verificar se a página ainda está válida
      try {
        await page.evaluate(() => true);
        return page;
      } catch (error) {
        console.log('Página do pool inválida, criando nova...');
        // Página inválida, criar nova
      }
    }
    
    // Criar nova página
    const page = await this.browser.newPage();
    
    // Configurações otimizadas para a página
    await page.setDefaultTimeout(60000);
    await page.setDefaultNavigationTimeout(60000);
    
    return page;
  }

  async returnPage(page, isFromPool = true) {
    try {
      if (isFromPool && this.pagePool.length < this.maxPages) {
        // Limpar página antes de retornar ao pool
        await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10000 });
        this.pagePool.push(page);
      } else {
        await page.close();
      }
    } catch (error) {
      // Se houver erro, apenas fechar a página
      try {
        await page.close();
      } catch (closeError) {
        console.log('Erro ao fechar página:', closeError.message);
      }
    }
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
      
      // Configurações otimizadas do mammoth
      const result = await mammoth.convertToHtml({ 
        buffer: wordBuffer 
      }, {
        styleMap: [
          "p[style-name='Normal'] => p:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh"
        ],
        ignoreEmptyParagraphs: false,
        convertImage: mammoth.images.imgElement(function(image) {
          return image.read("base64").then(function(imageBuffer) {
            return {
              src: "data:" + image.contentType + ";base64," + imageBuffer
            };
          });
        })
      });
      
      // HTML otimizado com CSS inline para melhor performance
      const styledHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Times New Roman', serif;
              font-size: 12pt;
              line-height: 1.15;
              margin: 1in;
              color: #000;
              background: #fff;
            }
            p { margin: 0 0 6pt 0; text-align: justify; }
            img {
              max-width: 200px; max-height: 80px;
              display: block; margin: -5px auto 0 auto;
              position: relative; z-index: 2;
            }
            strong { font-weight: bold; }
            em { font-style: italic; }
            u { text-decoration: underline; }
          </style>
        </head>
        <body>${result.value}</body>
        </html>
      `;
      
      return styledHTML;
    } catch (error) {
      throw new Error(`Erro na conversão Word→HTML: ${error.message}`);
    }
  }

  async convertHTMLToPDF(htmlContent) {
    const page = await this.getPage();
    const isFromPool = this.pagePool.length < this.maxPages;
    
    try {
      // Configurações otimizadas com timeouts mais generosos
      await page.setContent(htmlContent, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 // Aumentado para 30s
      });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in'
        },
        printBackground: true,
        preferCSSPageSize: true,
        timeout: 45000 // Aumentado para 45s
      });
      
      return pdfBuffer;
    } catch (error) {
      // Retry uma vez com timeout ainda maior se falhar
      if (error.message.includes('Timed out') || error.message.includes('timeout')) {
        console.log('Timeout detectado, tentando novamente com configurações mais lentas...');
        try {
          await page.setContent(htmlContent, { 
            waitUntil: 'load',
            timeout: 60000
          });
          
          const pdfBuffer = await page.pdf({
            format: 'A4',
            margin: {
              top: '1in',
              right: '1in',
              bottom: '1in',
              left: '1in'
            },
            printBackground: true,
            preferCSSPageSize: true,
            timeout: 90000
          });
          
          return pdfBuffer;
        } catch (retryError) {
          throw new Error(`Erro na conversão HTML→PDF após retry: ${retryError.message}`);
        }
      }
      throw new Error(`Erro na conversão HTML→PDF: ${error.message}`);
    } finally {
      await this.returnPage(page, isFromPool);
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
      // Fechar todas as páginas do pool
      const closePromises = this.pagePool.map(page => page.close().catch(() => {}));
      await Promise.all(closePromises);
      this.pagePool = [];
      
      await this.browser.close();
      this.browser = null;
      console.log('Browser e pool de páginas limpos');
    }
  }
}

module.exports = PurePDFConverter;