const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const PureWordProcessor = require('./pureWordProcessor');
const PurePDFConverter = require('./purePDFConverter');

class DocumentProcessor {
  constructor(tempDir) {
    this.tempDir = tempDir;
    this.wordProcessor = new PureWordProcessor();
    this.pdfConverter = new PurePDFConverter();
  }

  async createSignatureFromCanvas(signatureData) {
    try {
      const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      const signaturePath = path.join(this.tempDir, 'canvas-signature.png');
      
      await sharp(buffer)
        .resize(200, 80, { 
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({ quality: 100 })
        .toFile(signaturePath);
      
      return signaturePath;
    } catch (error) {
      throw new Error(`Erro ao processar assinatura: ${error.message}`);
    }
  }

  async processSignatureImage(signaturePath) {
    try {
      const processedPath = path.join(this.tempDir, 'processed-signature.png');
      
      await sharp(signaturePath)
        .resize(200, 80, { 
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({ quality: 100 })
        .toFile(processedPath);
      
      return processedPath;
    } catch (error) {
      throw new Error(`Erro ao processar assinatura: ${error.message}`);
    }
  }

  async processDocuments(documents, signaturePath, positioning = null) {
    const processedFiles = [];
    const processedSignature = await this.processSignatureImage(signaturePath);
    
    // Process all documents in parallel for speed
    const processingPromises = documents.map(async (doc, index) => {
      try {
        console.log(`Processando: ${doc.originalname}`);
        
        const signedWordPath = await this.wordProcessor.processWordDocument(doc.path, processedSignature);
        const pdfResult = await this.pdfConverter.convertWordToPDF(signedWordPath);
        
        await fs.remove(signedWordPath).catch(() => {});
        
        return {
          name: path.basename(doc.originalname, '.docx') + '_assinado.pdf',
          data: pdfResult.buffer,
          size: pdfResult.size
        };
      } catch (error) {
        console.error(`Erro ao processar ${doc.originalname}:`, error);
        throw new Error(`Falha ao processar ${doc.originalname}: ${error.message}`);
      }
    });
    
    const results = await Promise.all(processingPromises);
    processedFiles.push(...results);
    
    console.log(`Processamento concluído: ${processedFiles.length} arquivos`);
    return processedFiles;
  }

  async detectSignatureLocations(docxPath) {
    // Simplified detection - just return empty for now
    return {
      detectedLocations: [],
      summary: { totalLocations: 0, averageConfidence: 0 }
    };
  }

  async checkSystemRequirements() {
    const checks = {
      puppeteer: await this.pdfConverter.checkAvailability(),
      tempDir: await fs.pathExists(this.tempDir),
      sharp: true
    };
    
    const allGood = checks.puppeteer.available && checks.tempDir && checks.sharp;
    
    return {
      ready: allGood,
      checks,
      recommendations: allGood ? [] : [
        !checks.puppeteer.available ? 'Puppeteer não disponível' : null,
        !checks.tempDir ? 'Diretório temporário inacessível' : null
      ].filter(Boolean)
    };
  }

  async cleanup() {
    await this.pdfConverter.cleanup();
  }
}

module.exports = DocumentProcessor;