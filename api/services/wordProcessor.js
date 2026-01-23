const fs = require('fs-extra');
const path = require('path');
const PizZip = require('pizzip');
const xml2js = require('xml2js');
const sharp = require('sharp');

class WordProcessor {
  constructor() {
    this.signatureMarkers = [
      /_{5,}/g, // Linhas de sublinhado (5+ underscores)
      /ASSINATURA/gi,
      /LOCAL DA ASSINATURA/gi,
      /SIGN HERE/gi,
      /SIGNATURE/gi,
      /ASSINAR AQUI/gi
    ];
  }

  async processWordDocument(docxPath, signaturePath) {
    try {
      // Ler o documento Word
      const docxBuffer = await fs.readFile(docxPath);
      const zip = new PizZip(docxBuffer);
      
      // Processar assinatura
      const processedSignature = await this.processSignatureImage(signaturePath);
      
      // Extrair e modificar document.xml
      const documentXml = zip.file('word/document.xml').asText();
      const modifiedXml = await this.insertSignatureIntoXml(documentXml, processedSignature);
      
      // Atualizar o documento
      zip.file('word/document.xml', modifiedXml);
      
      // Adicionar imagem da assinatura aos media
      const signatureBuffer = await fs.readFile(processedSignature.path);
      zip.file(`word/media/signature.png`, signatureBuffer);
      
      // Atualizar relationships
      await this.updateRelationships(zip);
      
      // Gerar novo documento
      const modifiedDocxPath = path.join(path.dirname(docxPath), 'signed_' + path.basename(docxPath));
      const modifiedBuffer = zip.generate({ type: 'nodebuffer' });
      await fs.writeFile(modifiedDocxPath, modifiedBuffer);
      
      return modifiedDocxPath;
    } catch (error) {
      throw new Error(`Erro ao processar documento Word: ${error.message}`);
    }
  }

  async processSignatureImage(signaturePath) {
    try {
      const processedPath = path.join(path.dirname(signaturePath), 'processed_signature.png');
      
      // Otimizar assinatura para inserção no Word
      const metadata = await sharp(signaturePath).metadata();
      
      // Calcular dimensões proporcionais (máximo 200x80 pixels)
      const maxWidth = 200;
      const maxHeight = 80;
      const aspectRatio = metadata.width / metadata.height;
      
      let width = maxWidth;
      let height = width / aspectRatio;
      
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }
      
      await sharp(signaturePath)
        .resize(Math.round(width), Math.round(height), {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({
          compressionLevel: 6,
          adaptiveFiltering: true
        })
        .toFile(processedPath);
      
      return {
        path: processedPath,
        width: Math.round(width),
        height: Math.round(height)
      };
    } catch (error) {
      throw new Error(`Erro ao processar imagem da assinatura: ${error.message}`);
    }
  }

  async insertSignatureIntoXml(documentXml, signatureInfo) {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const builder = new xml2js.Builder({ 
        explicitArray: false,
        renderOpts: { pretty: false }
      });
      
      const doc = await parser.parseStringPromise(documentXml);
      
      // Navegar pela estrutura do documento
      const body = doc['w:document']['w:body'];
      const paragraphs = Array.isArray(body['w:p']) ? body['w:p'] : [body['w:p']];
      
      let signatureInserted = false;
      
      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        
        if (paragraph && paragraph['w:r']) {
          const runs = Array.isArray(paragraph['w:r']) ? paragraph['w:r'] : [paragraph['w:r']];
          
          for (let j = 0; j < runs.length; j++) {
            const run = runs[j];
            
            if (run['w:t']) {
              const text = typeof run['w:t'] === 'string' ? run['w:t'] : run['w:t']['_'];
              
              // Verificar se é uma linha de assinatura ou marcador
              if (this.isSignatureLocation(text)) {
                // Substituir por imagem da assinatura
                const signatureRun = this.createSignatureRun(signatureInfo);
                
                // Limpar texto original
                run['w:t'] = '';
                
                // Inserir imagem da assinatura
                if (!paragraph['w:r']) paragraph['w:r'] = [];
                if (!Array.isArray(paragraph['w:r'])) paragraph['w:r'] = [paragraph['w:r']];
                
                paragraph['w:r'].splice(j + 1, 0, signatureRun);
                signatureInserted = true;
                break;
              }
            }
          }
          
          if (signatureInserted) break;
        }
      }
      
      return builder.buildObject(doc);
    } catch (error) {
      throw new Error(`Erro ao inserir assinatura no XML: ${error.message}`);
    }
  }

  isSignatureLocation(text) {
    if (!text) return false;
    
    // Verificar linhas de sublinhado
    if (/__{5,}/.test(text)) return true;
    
    // Verificar marcadores de texto
    return this.signatureMarkers.some(marker => {
      if (marker instanceof RegExp) {
        return marker.test(text);
      }
      return text.toLowerCase().includes(marker.toLowerCase());
    });
  }

  createSignatureRun(signatureInfo) {
    return {
      'w:r': {
        'w:rPr': {
          'w:noProof': ''
        },
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
                'cx': (signatureInfo.width * 9525).toString(), // Converter pixels para EMUs
                'cy': (signatureInfo.height * 9525).toString()
              }
            },
            'wp:effectExtent': {
              '$': {
                'l': '0',
                't': '0',
                'r': '0',
                'b': '0'
              }
            },
            'wp:docPr': {
              '$': {
                'id': '1',
                'name': 'Signature'
              }
            },
            'wp:cNvGraphicFramePr': {
              'a:graphicFrameLocks': {
                '$': {
                  'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                  'noChangeAspect': '1'
                }
              }
            },
            'a:graphic': {
              '$': {
                'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main'
              },
              'a:graphicData': {
                '$': {
                  'uri': 'http://schemas.openxmlformats.org/drawingml/2006/picture'
                },
                'pic:pic': {
                  '$': {
                    'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'
                  },
                  'pic:nvPicPr': {
                    'pic:cNvPr': {
                      '$': {
                        'id': '1',
                        'name': 'signature.png'
                      }
                    },
                    'pic:cNvPicPr': ''
                  },
                  'pic:blipFill': {
                    'a:blip': {
                      '$': {
                        'r:embed': 'rId999'
                      }
                    },
                    'a:stretch': {
                      'a:fillRect': ''
                    }
                  },
                  'pic:spPr': {
                    'a:xfrm': {
                      'a:off': {
                        '$': { 'x': '0', 'y': '0' }
                      },
                      'a:ext': {
                        '$': {
                          'cx': (signatureInfo.width * 9525).toString(),
                          'cy': (signatureInfo.height * 9525).toString()
                        }
                      }
                    },
                    'a:prstGeom': {
                      '$': { 'prst': 'rect' },
                      'a:avLst': ''
                    }
                  }
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
      // Atualizar document.xml.rels
      const relsPath = 'word/_rels/document.xml.rels';
      let relsXml = zip.file(relsPath).asText();
      
      // Adicionar relationship para a imagem da assinatura
      const signatureRel = '<Relationship Id="rId999" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature.png"/>';
      
      // Inserir antes do fechamento da tag Relationships
      relsXml = relsXml.replace('</Relationships>', signatureRel + '</Relationships>');
      
      zip.file(relsPath, relsXml);
      
      // Atualizar [Content_Types].xml
      let contentTypesXml = zip.file('[Content_Types].xml').asText();
      
      // Adicionar tipo para PNG se não existir
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

module.exports = WordProcessor;