const JSZip = require('jszip');
const fs = require('fs-extra');
const xml2js = require('xml2js');

class EnhancedSignatureDetector {
  constructor() {
    this.signaturePatterns = [
      // Linhas horizontais (5+ underscores)
      { pattern: /_{5,}/g, type: 'line', priority: 1 },
      // Texto de assinatura
      { pattern: /ASSINATURA/gi, type: 'text', priority: 2 },
      { pattern: /LOCAL DA ASSINATURA/gi, type: 'text', priority: 2 },
      { pattern: /SIGN HERE/gi, type: 'text', priority: 2 },
      { pattern: /SIGNATURE/gi, type: 'text', priority: 2 },
      { pattern: /ASSINAR AQUI/gi, type: 'text', priority: 2 },
      // Campos de formulário
      { pattern: /\[.*ASSIN.*\]/gi, type: 'field', priority: 3 }
    ];
  }

  async detectSignatureLocations(docxPath) {
    try {
      const docxBuffer = await fs.readFile(docxPath);
      const zip = await JSZip.loadAsync(docxBuffer);
      
      const documentXml = await zip.file('word/document.xml').async('text');
      const parser = new xml2js.Parser({ explicitArray: false });
      const doc = await parser.parseStringPromise(documentXml);
      
      const locations = await this.analyzeDocumentStructure(doc);
      
      return {
        detectedLocations: locations,
        summary: {
          totalLocations: locations.length,
          averageConfidence: locations.reduce((sum, loc) => sum + loc.confidence, 0) / locations.length || 0,
          lineDetections: locations.filter(loc => loc.type === 'line').length,
          textDetections: locations.filter(loc => loc.type === 'text').length
        }
      };
    } catch (error) {
      throw new Error(`Erro na detecção: ${error.message}`);
    }
  }

  async analyzeDocumentStructure(doc) {
    const locations = [];
    const body = doc['w:document']['w:body'];
    const paragraphs = Array.isArray(body['w:p']) ? body['w:p'] : [body['w:p']];
    
    for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
      const paragraph = paragraphs[pIndex];
      if (!paragraph) continue;
      
      const paragraphText = this.extractParagraphText(paragraph);
      const lineAnalysis = this.analyzeSignatureLine(paragraphText, pIndex);
      
      if (lineAnalysis.isSignatureLocation) {
        const positioning = this.calculateOptimalPositioning(paragraph, lineAnalysis);
        
        locations.push({
          paragraphIndex: pIndex,
          type: lineAnalysis.type,
          confidence: lineAnalysis.confidence,
          text: paragraphText,
          lineLength: lineAnalysis.lineLength,
          positioning: positioning,
          metadata: {
            hasUnderscores: lineAnalysis.hasUnderscores,
            underscoreCount: lineAnalysis.underscoreCount,
            textBefore: this.getContextText(paragraphs, pIndex - 1),
            textAfter: this.getContextText(paragraphs, pIndex + 1)
          }
        });
      }
    }
    
    return this.optimizeLocationSelection(locations);
  }

  extractParagraphText(paragraph) {
    let text = '';
    
    if (paragraph['w:r']) {
      const runs = Array.isArray(paragraph['w:r']) ? paragraph['w:r'] : [paragraph['w:r']];
      
      runs.forEach(run => {
        if (run['w:t']) {
          const runText = typeof run['w:t'] === 'string' ? run['w:t'] : run['w:t']['_'] || '';
          text += runText;
        }
      });
    }
    
    return text.trim();
  }

  analyzeSignatureLine(text, paragraphIndex) {
    let confidence = 0;
    let type = 'unknown';
    let hasUnderscores = false;
    let underscoreCount = 0;
    let lineLength = 0;
    
    // Detectar linhas de underscore
    const underscoreMatch = text.match(/_{3,}/g);
    if (underscoreMatch) {
      hasUnderscores = true;
      underscoreCount = underscoreMatch.join('').length;
      lineLength = underscoreCount;
      type = 'line';
      
      // Confiança baseada no comprimento da linha
      if (underscoreCount >= 20) confidence = 0.95;
      else if (underscoreCount >= 10) confidence = 0.85;
      else if (underscoreCount >= 5) confidence = 0.70;
      else confidence = 0.50;
      
      // Bonus se a linha estiver isolada
      if (text.replace(/_/g, '').trim().length === 0) {
        confidence += 0.05;
      }
    }
    
    // Detectar texto de assinatura
    for (const pattern of this.signaturePatterns) {
      if (pattern.type !== 'line' && pattern.pattern.test(text)) {
        type = pattern.type;
        confidence = Math.max(confidence, 0.60 + (0.10 * (4 - pattern.priority)));
        break;
      }
    }
    
    return {
      isSignatureLocation: confidence > 0.50,
      confidence,
      type,
      hasUnderscores,
      underscoreCount,
      lineLength: lineLength || text.length
    };
  }

  calculateOptimalPositioning(paragraph, lineAnalysis) {
    // Calcular posicionamento baseado no tipo de detecção
    let verticalOffset = 0;
    let horizontalAlignment = 'center';
    let scaleFactors = { width: 1.0, height: 1.0 };
    
    if (lineAnalysis.type === 'line') {
      // Para linhas de underscore, posicionar ligeiramente acima
      verticalOffset = -10; // pixels acima da linha
      
      // Ajustar tamanho baseado no comprimento da linha
      if (lineAnalysis.underscoreCount >= 20) {
        scaleFactors.width = 1.2;
      } else if (lineAnalysis.underscoreCount >= 10) {
        scaleFactors.width = 1.0;
      } else {
        scaleFactors.width = 0.8;
      }
    } else if (lineAnalysis.type === 'text') {
      // Para texto de assinatura, posicionar ao lado ou abaixo
      verticalOffset = 5;
      horizontalAlignment = 'left';
      scaleFactors.width = 0.9;
    }
    
    return {
      verticalOffset,
      horizontalAlignment,
      scaleFactors,
      zIndex: 1 // Garantir que fique sobre a linha
    };
  }

  getContextText(paragraphs, index) {
    if (index < 0 || index >= paragraphs.length || !paragraphs[index]) {
      return '';
    }
    return this.extractParagraphText(paragraphs[index]);
  }

  optimizeLocationSelection(locations) {
    // Remover duplicatas próximas
    const optimized = [];
    
    for (const location of locations) {
      const isDuplicate = optimized.some(existing => 
        Math.abs(existing.paragraphIndex - location.paragraphIndex) <= 1 &&
        existing.type === location.type
      );
      
      if (!isDuplicate) {
        optimized.push(location);
      } else {
        // Manter o de maior confiança
        const existingIndex = optimized.findIndex(existing => 
          Math.abs(existing.paragraphIndex - location.paragraphIndex) <= 1 &&
          existing.type === location.type
        );
        
        if (location.confidence > optimized[existingIndex].confidence) {
          optimized[existingIndex] = location;
        }
      }
    }
    
    // Ordenar por confiança
    return optimized.sort((a, b) => b.confidence - a.confidence);
  }

  // Método para validar se uma posição é adequada para assinatura
  validateSignaturePosition(location, documentContext) {
    const validationScore = {
      positioning: 0,
      context: 0,
      technical: 0
    };
    
    // Validar posicionamento
    if (location.type === 'line' && location.confidence > 0.80) {
      validationScore.positioning = 0.9;
    } else if (location.type === 'text' && location.confidence > 0.70) {
      validationScore.positioning = 0.7;
    }
    
    // Validar contexto
    const contextBefore = location.metadata.textBefore.toLowerCase();
    const contextAfter = location.metadata.textAfter.toLowerCase();
    
    if (contextBefore.includes('nome') || contextBefore.includes('assinatura') || 
        contextAfter.includes('data') || contextAfter.includes('cargo')) {
      validationScore.context = 0.8;
    }
    
    // Validação técnica
    if (location.lineLength >= 10 && location.lineLength <= 50) {
      validationScore.technical = 0.9;
    }
    
    const overallScore = (validationScore.positioning + validationScore.context + validationScore.technical) / 3;
    
    return {
      isValid: overallScore > 0.6,
      score: overallScore,
      details: validationScore
    };
  }
}

module.exports = EnhancedSignatureDetector;