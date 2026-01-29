const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const DocumentProcessor = require('./services/documentProcessor');
const securityConfig = require('./config/security');
const ValidationMiddleware = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middlewares
app.use(securityConfig.helmet);
app.use(securityConfig.general);
app.use(cors({
  origin: NODE_ENV === 'production' ? false : true,
  credentials: false
}));
app.use(express.json({ limit: '1mb' }));

// Secure multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(os.tmpdir(), 'exactsign', uuidv4());
    fs.ensureDirSync(tempDir);
    req.tempDir = tempDir;
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const sanitized = ValidationMiddleware.sanitizeFilename(file.originalname);
    cb(null, sanitized);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    try {
      if (file.fieldname === 'documents') {
        if (securityConfig.allowedMimeTypes.documents.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Apenas arquivos .docx são permitidos'));
        }
      } else if (file.fieldname === 'signature') {
        if (securityConfig.allowedMimeTypes.images.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Apenas imagens PNG/JPG são permitidas'));
        }
      } else {
        cb(new Error('Campo não reconhecido'));
      }
    } catch (error) {
      cb(error);
    }
  },
  limits: {
    fileSize: securityConfig.maxFileSizes.document,
    files: 10
  }
});

// Main processing endpoint
app.post('/api/process-documents', 
  securityConfig.upload,
  upload.fields([
    { name: 'documents', maxCount: 10 },
    { name: 'signature', maxCount: 1 }
  ]), 
  async (req, res) => {
    let tempDir = req.tempDir;
    
    try {
      const { documents, signature } = req.files || {};
      const { signatureData } = req.body;

      if (!documents?.length) {
        return res.status(400).json({ error: 'Nenhum documento enviado' });
      }

      if (!signature && !signatureData) {
        return res.status(400).json({ error: 'Assinatura obrigatória' });
      }

      // Validate documents
      for (const doc of documents) {
        await ValidationMiddleware.validateDocumentIntegrity(doc.path);
      }

      const processor = new DocumentProcessor(tempDir);
      
      let signaturePath;
      if (signature) {
        signaturePath = signature[0].path;
      } else {
        ValidationMiddleware.validateSignatureData(signatureData);
        signaturePath = await processor.createSignatureFromCanvas(signatureData);
      }

      const processedFiles = await processor.processDocuments(documents, signaturePath);
      
      res.json({
        success: true,
        files: processedFiles.map(file => ({
          name: file.name,
          data: file.data.toString('base64'),
          size: file.size
        }))
      });

    } catch (error) {
      console.error('Processing error:', error.message);
      res.status(500).json({ 
        error: 'Erro no processamento',
        details: NODE_ENV === 'development' ? error.message : 'Erro interno'
      });
    } finally {
      if (tempDir) {
        ValidationMiddleware.cleanupTempFiles(tempDir);
      }
    }
  }
);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    version: '2.0.0',
    timestamp: new Date().toISOString() 
  });
});

// System requirements check
app.get('/api/system-check', async (req, res) => {
  try {
    const tempDir = path.join(os.tmpdir(), 'exactsign-check');
    await fs.ensureDir(tempDir);
    
    const processor = new DocumentProcessor(tempDir);
    const systemCheck = await processor.checkSystemRequirements();
    
    res.json({
      success: true,
      system: systemCheck
    });
    
    await fs.remove(tempDir).catch(() => {});
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'System check failed'
    });
  }
});

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Muitos arquivos' });
    }
  }
  
  res.status(500).json({ 
    error: 'Erro interno',
    details: NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Encerrando servidor...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🚀 ExactSign API v2.0.0 - Porta ${PORT}`);
  console.log(`📋 Health: http://localhost:${PORT}/api/health`);
  console.log(`🔒 Modo: ${NODE_ENV}`);
});

module.exports = app;