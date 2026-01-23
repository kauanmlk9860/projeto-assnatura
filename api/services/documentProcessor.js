const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const PureWordProcessor = require('./pureWordProcessor');
const PurePDFConverter = require('./purePDFConverter');
const EnhancedSignatureDetector = require('./enhancedSignatureDetector');

class DocumentProcessor {
  constructor(tempDir) {
    this.tempDir = tempDir;
    this.wordProcessor = new PureWordProcessor();
    this.pdfConverter = new PurePDFConverter();
    this.signatureDetector = new EnhancedSignatureDetector();
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
    
    for (const doc of documents) {
      try {
        console.log(`Processando: ${doc.originalname}`);
        
        const signedWordPath = await this.wordProcessor.processWordDocument(doc.path, processedSignature);
        const pdfResult = await this.pdfConverter.convertWordToPDF(signedWordPath);
        
        const validation = await this.pdfConverter.validatePDFOutput(pdfResult.path);
        if (!validation.valid) {
          throw new Error(`PDF inválido: ${validation.error}`);
        }
        
        processedFiles.push({
          name: path.basename(doc.originalname, '.docx') + '_assinado.pdf',
          data: pdfResult.buffer,
          size: pdfResult.size
        });
        
        await fs.remove(signedWordPath).catch(() => {});
        
        console.log(`Processado: ${doc.originalname} (${pdfResult.size} bytes)`);
      } catch (error) {
        console.error(`Erro ao processar ${doc.originalname}:`, error);
        throw new Error(`Falha ao processar ${doc.originalname}: ${error.message}`);
      }
    }
    
    return processedFiles;
  }

  async detectSignatureLocations(docxPath) {
    try {
      const result = await this.signatureDetector.detectSignatureLocations(docxPath);
      console.log(`Detecção concluída: ${result.detectedLocations.length} localizações encontradas`);
      
      // Log detalhado das detecções
      result.detectedLocations.forEach((location, index) => {
        console.log(`Localização ${index + 1}: Tipo=${location.type}, Confiança=${location.confidence.toFixed(2)}, Linha="${location.text.substring(0, 50)}..."`);  
      });
      
      return result;
    } catch (error) {
      console.warn('Falha na detecção automática:', error.message);
      return {
        detectedLocations: [],
        summary: { totalLocations: 0, averageConfidence: 0 },
        processedText: ''
      };
    }
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