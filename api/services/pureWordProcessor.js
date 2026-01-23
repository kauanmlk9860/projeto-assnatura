const JSZip = require('jszip');
const fs = require('fs-extra');
const path = require('path');
const xml2js = require('xml2js');
const sharp = require('sharp');
const EnhancedSignatureDetector = require('./enhancedSignatureDetector');

class PureWordProcessor {
  constructor() {
    this.signatureDetector = new EnhancedSignatureDetector();
    this.signatureMarkers = [
      /_{5,}/g,
      /ASSINATURA/gi,
      /LOCAL DA ASSINATURA/gi,
      /SIGN HERE/gi,
      /SIGNATURE/gi,
      /ASSINAR AQUI/gi
    ];
  }

  async processWordDocument(docxPath, signaturePath) {
    try {
      const docxBuffer = await fs.readFile(docxPath);
      const zip = await JSZip.loadAsync(docxBuffer);
      
      // Detectar localizações de assinatura com precisão
      const detectionResult = await this.signatureDetector.detectSignatureLocations(docxPath);
      
      const processedSignature = await this.processSignatureImage(signaturePath, detectionResult);
      
      const documentXml = await zip.file('word/document.xml').async('text');
      const modifiedXml = await this.insertSignatureIntoXml(documentXml, processedSignature, detectionResult);
      
      zip.file('word/document.xml', modifiedXml);
      
      const signatureBuffer = await fs.readFile(processedSignature.path);
      zip.file('word/media/signature.png', signatureBuffer);
      
      await this.updateRelationships(zip);
      
      const modifiedDocxPath = path.join(path.dirname(docxPath), 'signed_' + path.basename(docxPath));
      const modifiedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      await fs.writeFile(modifiedDocxPath, modifiedBuffer);
      
      return modifiedDocxPath;
    } catch (error) {
      throw new Error(`Erro ao processar documento Word: ${error.message}`);
    }
  }

  async processSignatureImage(signaturePath, detectionResult = null) {
    try {
      const processedPath = path.join(path.dirname(signaturePath), 'processed_signature.png');
      
      // Calcular dimensões baseadas na detecção
      let targetWidth = 200;
      let targetHeight = 80;
      
      if (detectionResult && detectionResult.detectedLocations.length > 0) {
        const primaryLocation = detectionResult.detectedLocations[0];
        const scaleFactors = primaryLocation.positioning.scaleFactors;
        
        targetWidth = Math.round(targetWidth * scaleFactors.width);
        targetHeight = Math.round(targetHeight * scaleFactors.height);
        
        // Ajustar baseado no comprimento da linha detectada
        if (primaryLocation.lineLength > 20) {
          targetWidth = Math.min(targetWidth * 1.2, 300);
        } else if (primaryLocation.lineLength < 10) {
          targetWidth = Math.max(targetWidth * 0.8, 120);
        }
      }
      
      await sharp(signaturePath)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({ quality: 100 })
        .toFile(processedPath);
      
      return { 
        path: processedPath, 
        width: targetWidth, 
        height: targetHeight,
        detectionBased: !!detectionResult
      };
    } catch (error) {
      throw new Error(`Erro ao processar assinatura: ${error.message}`);
    }
  }

  async insertSignatureIntoXml(documentXml, signatureInfo, detectionResult = null) {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const builder = new xml2js.Builder({ explicitArray: false, renderOpts: { pretty: false } });
      
      const doc = await parser.parseStringPromise(documentXml);
      const body = doc['w:document']['w:body'];
      const paragraphs = Array.isArray(body['w:p']) ? body['w:p'] : [body['w:p']];
      
      let insertionsMade = 0;
      
      // Usar detecção avançada se disponível
      if (detectionResult && detectionResult.detectedLocations.length > 0) {
        for (const location of detectionResult.detectedLocations) {
          if (location.paragraphIndex < paragraphs.length) {
            const paragraph = paragraphs[location.paragraphIndex];
            const signatureRun = this.createPreciseSignatureRun(signatureInfo, location);
            
            if (!Array.isArray(paragraph['w:r'])) {
              paragraph['w:r'] = paragraph['w:r'] ? [paragraph['w:r']] : [];
            }
            
            // Inserir assinatura no início do parágrafo (sobre a linha)
            paragraph['w:r'].unshift(signatureRun);
            insertionsMade++;
          }
        }
      } else {
        // Fallback para detecção simples
        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = paragraphs[i];
          
          if (paragraph && paragraph['w:r']) {
            const runs = Array.isArray(paragraph['w:r']) ? paragraph['w:r'] : [paragraph['w:r']];
            
            for (let j = 0; j < runs.length; j++) {
              const run = runs[j];
              
              if (run['w:t']) {
                const text = typeof run['w:t'] === 'string' ? run['w:t'] : run['w:t']['_'];
                
                if (this.isSignatureLocation(text)) {
                  const signatureRun = this.createSignatureRun(signatureInfo);
                  
                  if (!Array.isArray(paragraph['w:r'])) paragraph['w:r'] = [paragraph['w:r']];
                  paragraph['w:r'].splice(j, 0, signatureRun);
                  insertionsMade++;
                  break;
                }
              }
            }
          }
        }
      }
      
      console.log(`Assinaturas inseridas: ${insertionsMade}`);
      return builder.buildObject(doc);
    } catch (error) {
      throw new Error(`Erro ao inserir assinatura: ${error.message}`);
    }
  }

  isSignatureLocation(text) {
    if (!text) return false;
    if (/__{5,}/.test(text)) return true;
    return this.signatureMarkers.some(marker => marker.test(text));
  }

  createPreciseSignatureRun(signatureInfo, location) {
    const positioning = location.positioning;
    
    // Calcular offset vertical em EMUs (English Metric Units)
    const verticalOffsetEMU = positioning.verticalOffset * 635; // Convert pixels to EMU
    
    return {
      'w:drawing': {
        'wp:inline': {
          '$': { 
            'distT': '0', 
            'distB': '0', 
            'distL': '0', 
            'distR': '0'
          },
          'wp:extent': {
            '$': {
              'cx': (signatureInfo.width * 9525).toString(),
              'cy': (signatureInfo.height * 9525).toString()
            }
          },
          'wp:docPr': { '$': { 'id': '1', 'name': 'Signature' } },
          'a:graphic': {
            '$': { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main' },
            'a:graphicData': {
              '$': { 'uri': 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
              'pic:pic': {
                '$': { 'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                'pic:nvPicPr': {
                  'pic:cNvPr': { '$': { 'id': '1', 'name': 'signature.png' } },
                  'pic:cNvPicPr': ''
                },
                'pic:blipFill': {
                  'a:blip': { '$': { 'r:embed': 'rId999' } },
                  'a:stretch': { 'a:fillRect': '' }
                },
                'pic:spPr': {
                  'a:xfrm': {
                    'a:off': { 
                      '$': { 
                        'x': '0', 
                        'y': verticalOffsetEMU.toString() 
                      } 
                    },
                    'a:ext': {
                      '$': {
                        'cx': (signatureInfo.width * 9525).toString(),
                        'cy': (signatureInfo.height * 9525).toString()
                      }
                    }
                  },
                  'a:prstGeom': { '$': { 'prst': 'rect' }, 'a:avLst': '' }
                }
              }
            }
          }
        }
      }
    };
  }

  createSignatureRun(signatureInfo) {
    // Fallback method for simple detection
    return {
      'w:drawing': {
        'wp:inline': {
          '$': { 'distT': '0', 'distB': '0', 'distL': '0', 'distR': '0' },
          'wp:extent': {
            '$': {
              'cx': (signatureInfo.width * 9525).toString(),
              'cy': (signatureInfo.height * 9525).toString()
            }
          },
          'wp:docPr': { '$': { 'id': '1', 'name': 'Signature' } },
          'a:graphic': {
            '$': { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main' },
            'a:graphicData': {
              '$': { 'uri': 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
              'pic:pic': {
                '$': { 'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                'pic:nvPicPr': {
                  'pic:cNvPr': { '$': { 'id': '1', 'name': 'signature.png' } },
                  'pic:cNvPicPr': ''
                },
                'pic:blipFill': {
                  'a:blip': { '$': { 'r:embed': 'rId999' } },
                  'a:stretch': { 'a:fillRect': '' }
                },
                'pic:spPr': {
                  'a:xfrm': {
                    'a:off': { '$': { 'x': '0', 'y': '-6350' } }, // Slight upward offset
                    'a:ext': {
                      '$': {
                        'cx': (signatureInfo.width * 9525).toString(),
                        'cy': (signatureInfo.height * 9525).toString()
                      }
                    }
                  },
                  'a:prstGeom': { '$': { 'prst': 'rect' }, 'a:avLst': '' }
                }
              }
            }
          }
        }
      }
    };
  }

  async updateRelationships(zip) {
      const relsPath = 'word/_rels/document.xml.rels';
      let relsXml = await zip.file(relsPath).async('text');
      
      const signatureRel = '<Relationship Id="rId999" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature.png"/>';
      relsXml = relsXml.replace('</Relationships>', signatureRel + '</Relationships>');
      zip.file(relsPath, relsXml);
      
      let contentTypesXml = await zip.file('[Content_Types].xml').async('text');
      if (!contentTypesXml.includes('Extension="png"')) {
        const pngType = '<Default Extension="png" ContentType="image/png"/>';
        contentTypesXml = contentTypesXml.replace('</Types>', pngType + '</Types>');
        zip.file('[Content_Types].xml', contentTypesXml);
      }
    } catch (error) {
      throw new Error(`Erro ao atualizar relationships: ${error.message}`);
    }
  }
}

module.exports = PureWordProcessor;