const path = require('path');
const fs = require('fs-extra');

class ValidationMiddleware {
  static validateFileType(allowedTypes) {
    return (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
      }
    };
  }

  static sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100);
  }

  static async validateDocumentIntegrity(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        throw new Error('Arquivo vazio');
      }
      
      const buffer = await fs.readFile(filePath, { encoding: null });
      const header = buffer.slice(0, 4);
      
      if (header[0] !== 0x50 || header[1] !== 0x4B) {
        throw new Error('Arquivo corrompido ou inválido');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Validação falhou: ${error.message}`);
    }
  }

  static validateSignatureData(signatureData) {
    if (!signatureData) return false;
    
    const base64Regex = /^data:image\/(png|jpeg|jpg);base64,/;
    if (!base64Regex.test(signatureData)) {
      throw new Error('Formato de assinatura inválido');
    }
    
    const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    if (buffer.length > 2 * 1024 * 1024) {
      throw new Error('Assinatura muito grande');
    }
    
    return true;
  }

  static async cleanupTempFiles(tempDir, delay = 5000) {
    setTimeout(async () => {
      try {
        if (await fs.pathExists(tempDir)) {
          await fs.remove(tempDir);
        }
      } catch (error) {
        console.error('Erro na limpeza:', error.message);
      }
    }, delay);
  }
}

module.exports = ValidationMiddleware;