const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
});

const securityConfig = {
  general: createRateLimit(15 * 60 * 1000, 100, 'Muitas requisições. Tente novamente em 15 minutos.'),
  upload: createRateLimit(15 * 60 * 1000, 3, 'Limite de uploads excedido. Tente novamente em 15 minutos.'),
  
  allowedMimeTypes: {
    documents: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    images: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif']
  },
  
  maxFileSizes: {
    document: 10 * 1024 * 1024,
    signature: 2 * 1024 * 1024
  },
  
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'", "https://unpkg.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
};

module.exports = securityConfig;