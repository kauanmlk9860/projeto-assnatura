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
    
    // Processar em lotes menores para evitar timeouts
    const BATCH_SIZE = 3; // Reduzido de 5 para 3
    const batches = [];
    
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      batches.push(documents.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Processando ${documents.length} documentos em ${batches.length} lotes de ${BATCH_SIZE}`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processando lote ${batchIndex + 1}/${batches.length} (${batch.length} documentos)`);
      
      const batchPromises = batch.map(async (doc, index) => {
        const maxRetries = 2;
        let lastError;
        
        for (let retry = 0; retry <= maxRetries; retry++) {
          try {
            const globalIndex = batchIndex * BATCH_SIZE + index;
            console.log(`[${globalIndex + 1}/${documents.length}] Processando: ${doc.originalname} (tentativa ${retry + 1})`);
            
            const signedWordPath = await this.wordProcessor.processWordDocument(doc.path, processedSignature);
            const pdfResult = await this.pdfConverter.convertWordToPDF(signedWordPath);
            
            // Limpeza imediata do arquivo Word temporário
            await fs.remove(signedWordPath).catch(() => {});
            
            return {
              name: path.basename(doc.originalname, '.docx') + '_assinado.pdf',
              data: pdfResult.buffer,
              size: pdfResult.size
            };
          } catch (error) {
            lastError = error;
            console.error(`Erro na tentativa ${retry + 1} para ${doc.originalname}:`, error.message);
            
            if (retry < maxRetries) {
              console.log(`Tentando novamente em 2 segundos...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
        
        throw new Error(`Falha ao processar ${doc.originalname} após ${maxRetries + 1} tentativas: ${lastError.message}`);
      });
      
      const batchResults = await Promise.all(batchPromises);
      processedFiles.push(...batchResults);
      
      console.log(`Lote ${batchIndex + 1} concluído. Total processado: ${processedFiles.length}/${documents.length}`);
      
      // Pequena pausa entre lotes para evitar sobrecarga
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Processamento concluído: ${processedFiles.length} arquivos em lotes otimizados`);
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