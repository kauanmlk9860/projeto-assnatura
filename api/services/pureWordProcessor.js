const JSZip = require('jszip');
const fs = require('fs-extra');
const path = require('path');
const xml2js = require('xml2js');
const sharp = require('sharp');

class PureWordProcessor {
  constructor() {
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
      
      // Rápida detecção e processamento
      const processedSignature = await this.processSignatureImage(signaturePath);
      
      const documentXml = await zip.file('word/document.xml').async('text');
      const modifiedXml = await this.insertSignatureIntoXml(documentXml, processedSignature);
      
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

  async processSignatureImage(signaturePath) {
    try {
      const processedPath = path.join(path.dirname(signaturePath), 'processed_signature.png');
      
      // Otimizações do Sharp para velocidade
      await sharp(signaturePath)
        .resize(200, 80, {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({ 
          quality: 90, // Reduzido de 100 para 90 para velocidade
          compressionLevel: 6, // Otimizado para velocidade
          progressive: false
        })
        .toFile(processedPath);
      
      return { 
        path: processedPath, 
        width: 200, 
        height: 80
      };
    } catch (error) {
      throw new Error(`Erro ao processar assinatura: ${error.message}`);
    }
  }

  async insertSignatureIntoXml(documentXml, signatureInfo) {
    try {
      // Parser otimizado para velocidade
      const parser = new xml2js.Parser({ 
        explicitArray: false,
        mergeAttrs: false,
        normalize: false,
        normalizeTags: false,
        trim: true
      });
      const builder = new xml2js.Builder({ 
        explicitArray: false, 
        renderOpts: { pretty: false, indent: '', newline: '' },
        xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true }
      });
      
      const doc = await parser.parseStringPromise(documentXml);
      const body = doc['w:document']['w:body'];
      const paragraphs = Array.isArray(body['w:p']) ? body['w:p'] : [body['w:p']];
      
      let insertionsMade = 0;
      
      // Busca otimizada por marcadores
      for (let i = 0; i < paragraphs.length && insertionsMade < 10; i++) { // Limite para evitar processamento excessivo
        const paragraph = paragraphs[i];
        
        if (paragraph && paragraph['w:r']) {
          const runs = Array.isArray(paragraph['w:r']) ? paragraph['w:r'] : [paragraph['w:r']];
          
          for (let j = 0; j < runs.length; j++) {
            const run = runs[j];
            
            if (run['w:t']) {
              const text = typeof run['w:t'] === 'string' ? run['w:t'] : run['w:t']['_'];
              
              if (this.isSignatureLocation(text)) {
                const isIsolatedLine = /^\s*_{5,}\s*$/.test(text);
                
                if (isIsolatedLine) {
                  paragraph['w:r'] = [this.createSignatureRun(signatureInfo)];
                } else {
                  const signatureRun = this.createSignatureRun(signatureInfo);
                  if (!Array.isArray(paragraph['w:r'])) paragraph['w:r'] = [paragraph['w:r']];
                  paragraph['w:r'].splice(j, 0, signatureRun);
                }
                
                insertionsMade++;
                break;
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

  replaceSignatureLine(paragraph, location) {
    if (!paragraph['w:r']) return;
    
    const runs = Array.isArray(paragraph['w:r']) ? paragraph['w:r'] : [paragraph['w:r']];
    
    // Encontrar e neutralizar runs com underscores
    runs.forEach(run => {
      if (run['w:t']) {
        const text = typeof run['w:t'] === 'string' ? run['w:t'] : run['w:t']['_'];
        if (text && /_+/.test(text)) {
          // Substituir underscores por espaços transparentes
          const replacementText = ' '.repeat(Math.min(text.length, 3));
          if (typeof run['w:t'] === 'string') {
            run['w:t'] = replacementText;
          } else {
            run['w:t']['_'] = replacementText;
          }
          
          // Adicionar formatação para tornar o texto quase invisível
          if (!run['w:rPr']) run['w:rPr'] = {};
          run['w:rPr']['w:color'] = { '$': { 'w:val': 'FFFFFF' } }; // Branco
          run['w:rPr']['w:sz'] = { '$': { 'w:val': '2' } }; // Tamanho mínimo
        }
      }
    });
  }

  createPreciseSignatureRun(signatureInfo, location) {
    const positioning = location.positioning;
    
    // Calcular offset vertical mais preciso
    const baseOffset = positioning.verticalOffset * 635; // Convert pixels to EMU
    const finalOffset = positioning.shouldReplaceLine ? 0 : baseOffset;
    
    // Calcular dimensões finais
    const finalWidth = Math.round(signatureInfo.width * positioning.scaleFactors.width);
    const finalHeight = Math.round(signatureInfo.height * positioning.scaleFactors.height);
    
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
              'cx': (finalWidth * 9525).toString(),
              'cy': (finalHeight * 9525).toString()
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
                        'y': finalOffset.toString() 
                      } 
                    },
                    'a:ext': {
                      '$': {
                        'cx': (finalWidth * 9525).toString(),
                        'cy': (finalHeight * 9525).toString()
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
    // Fallback melhorado para detecção simples
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
                    'a:off': { '$': { 'x': '0', 'y': '0' } }, // Posicionamento natural
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
    try {
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