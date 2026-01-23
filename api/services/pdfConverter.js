const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const libre = require('libreoffice-convert');

const convertAsync = promisify(libre.convert);

class PDFConverter {
  constructor() {
    this.libreOfficeOptions = {
      format: 'pdf',
      quality: 100,
      // Configurações para máxima fidelidade visual
      filter: {
        'ExportFormFields': false,
        'FormsType': 0,
        'ExportBookmarks': true,
        'ExportNotes': false,
        'ExportNotesPages': false,
        'ExportOnlyNotesPages': false,
        'ExportNotesInMargin': false,
        'ConvertOOoTargetToPDFTarget': false,
        'ExportLinksRelative': false,
        'ExportBookmarksToPDFDestination': false,
        'PDFViewSelection': 0,
        'ConvertOOoTargetToPDFTarget': false,
        'ExportLinksRelative': false
      }
    };
  }

  async convertWordToPDF(wordPath, outputPath = null) {
    try {
      // Verificar se o arquivo Word existe
      if (!await fs.pathExists(wordPath)) {
        throw new Error(`Arquivo Word não encontrado: ${wordPath}`);
      }

      // Ler o documento Word
      const wordBuffer = await fs.readFile(wordPath);
      
      console.log(`Iniciando conversão de alta fidelidade: ${path.basename(wordPath)}`);
      
      // Converter usando LibreOffice com configurações otimizadas
      const pdfBuffer = await convertAsync(wordBuffer, '.pdf', undefined);
      
      // Definir caminho de saída se não fornecido
      if (!outputPath) {
        const baseName = path.basename(wordPath, path.extname(wordPath));
        outputPath = path.join(path.dirname(wordPath), `${baseName}.pdf`);
      }
      
      // Salvar PDF
      await fs.writeFile(outputPath, pdfBuffer);
      
      console.log(`Conversão concluída: ${path.basename(outputPath)}`);
      
      return {
        path: outputPath,
        buffer: pdfBuffer,
        size: pdfBuffer.length
      };
    } catch (error) {
      console.error('Erro na conversão PDF:', error);
      
      // Verificar se é erro do LibreOffice
      if (error.message.includes('LibreOffice')) {
        throw new Error(
          'LibreOffice não encontrado. Instale o LibreOffice e adicione ao PATH do sistema. ' +
          'Download: https://www.libreoffice.org/download/'
        );
      }
      
      throw new Error(`Falha na conversão para PDF: ${error.message}`);
    }
  }

  async validatePDFOutput(pdfPath) {
    try {
      const stats = await fs.stat(pdfPath);
      
      // Verificar se o arquivo foi criado e tem tamanho razoável
      if (stats.size < 1000) {
        throw new Error('PDF gerado parece estar corrompido (muito pequeno)');
      }
      
      // Verificar se é um PDF válido (começa com %PDF)
      const buffer = await fs.readFile(pdfPath, { start: 0, end: 4 });
      if (!buffer.toString().startsWith('%PDF')) {
        throw new Error('Arquivo gerado não é um PDF válido');
      }
      
      return {
        valid: true,
        size: stats.size,
        path: pdfPath
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async batchConvert(wordFiles, outputDir) {
    const results = [];
    
    // Garantir que o diretório de saída existe
    await fs.ensureDir(outputDir);
    
    for (const wordFile of wordFiles) {
      try {
        const baseName = path.basename(wordFile, path.extname(wordFile));
        const outputPath = path.join(outputDir, `${baseName}.pdf`);
        
        const result = await this.convertWordToPDF(wordFile, outputPath);
        const validation = await this.validatePDFOutput(result.path);
        
        results.push({
          input: wordFile,
          output: result.path,
          success: validation.valid,
          size: result.size,
          error: validation.error || null
        });
      } catch (error) {
        results.push({
          input: wordFile,
          output: null,
          success: false,
          size: 0,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Método para verificar se LibreOffice está disponível
  async checkLibreOfficeAvailability() {
    try {
      // Tentar converter um documento vazio para testar
      const testBuffer = Buffer.from('test');
      await convertAsync(testBuffer, '.pdf', undefined);
      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: error.message,
        suggestion: 'Instale o LibreOffice e adicione ao PATH do sistema'
      };
    }
  }
}

module.exports = PDFConverter;