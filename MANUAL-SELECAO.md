# 📍 Manual de Seleção Manual de Assinatura

## 🎯 Visão Geral

A nova funcionalidade de **Seleção Manual do Local da Assinatura** permite que o usuário tenha controle total sobre onde a assinatura será posicionada no documento, mantendo a qualidade e padronização visual.

## 🚀 Como Usar

### 1️⃣ Upload do Documento
- Selecione um ou mais documentos Word (.docx)
- O sistema automaticamente gera uma pré-visualização do primeiro documento

### 2️⃣ Pré-visualização e Seleção
- **Visualização**: O documento é exibido em formato de páginas
- **Detecção Automática**: Locais detectados automaticamente são marcados em verde
- **Seleção Manual**: Clique exatamente onde deseja posicionar a assinatura

### 3️⃣ Modos de Operação

#### 🤖 Detecção Automática
- Sistema detecta automaticamente linhas de assinatura e textos "ASSINATURA"
- Usa algoritmos inteligentes para encontrar os melhores locais
- Confiança baseada em contexto e padrões

#### 🖱️ Seleção Manual
- Usuário clica no ponto exato desejado
- Coordenadas são normalizadas (0-1) para manter proporção
- Sistema ajusta automaticamente para manter estética

## 🔧 Funcionalidades Técnicas

### Normalização Automática
- **Coordenadas Relativas**: Posição baseada em porcentagem da página
- **Ajuste de Margens**: Assinatura nunca ultrapassa bordas do documento
- **Centralização**: Ajuste automático para melhor aparência
- **Proporção**: Mantém dimensões originais da assinatura

### Padronização Visual
- **Tamanho Consistente**: Assinatura sempre proporcional ao espaço
- **Alinhamento**: Posicionamento respeitando layout do documento
- **Espaçamento**: Margens automáticas para não sobrepor texto

## 📐 Prioridade de Decisão

O sistema segue esta ordem de prioridade:

1. **Seleção Manual** (sempre tem prioridade máxima)
2. **Detecção por Linha de Assinatura** (sublinhados)
3. **Detecção por Texto "ASSINATURA"**
4. **Erro** (se nenhum método for possível)

## 🎨 Interface do Usuário

### Controles Disponíveis
- **🤖 Usar Detecção Automática**: Ativa modo automático
- **🖱️ Seleção Manual**: Ativa modo de clique manual
- **📍 Marcador Visual**: Mostra onde a assinatura será inserida

### Informações Exibidas
- **Posição Selecionada**: Coordenadas e página escolhida
- **Status da Seleção**: Feedback em tempo real
- **Locais Detectados**: Sugestões automáticas em verde

## 🔄 Fluxo Completo

```
1. Upload do Documento Word
   ↓
2. Geração da Pré-visualização
   ↓
3. Detecção Automática de Locais
   ↓
4. Exibição para o Usuário
   ↓
5. Escolha do Modo (Auto/Manual)
   ↓
6. Seleção/Confirmação da Posição
   ↓
7. Normalização e Ajustes
   ↓
8. Inserção da Assinatura
   ↓
9. Conversão para PDF
   ↓
10. Download do Arquivo Final
```

## ⚡ Vantagens

### Para o Usuário
- **Controle Total**: Escolha exata da posição
- **Flexibilidade**: Funciona com qualquer tipo de documento
- **Facilidade**: Interface intuitiva de clique
- **Feedback Visual**: Vê exatamente onde ficará a assinatura

### Para o Sistema
- **Qualidade Garantida**: Padronização automática mantida
- **Compatibilidade**: Funciona com detecção automática
- **Robustez**: Fallback para modo automático
- **Performance**: Pré-visualização otimizada

## 🛡️ Regras de Segurança

### Validações Automáticas
- **Margens**: Assinatura nunca sai das bordas
- **Sobreposição**: Evita conflito com texto existente
- **Proporção**: Mantém dimensões adequadas
- **Layout**: Preserva estrutura do documento

### Normalização Obrigatória
- Mesmo com seleção manual, o sistema aplica:
  - Ajuste de centralização
  - Controle de margens
  - Padronização de tamanho
  - Manutenção de proporção

## 📱 Responsividade

- **Desktop**: Clique preciso com mouse
- **Mobile**: Touch otimizado para telas menores
- **Tablet**: Interface adaptada para touch
- **Acessibilidade**: Suporte a navegação por teclado

## 🔍 Debugging e Logs

### Informações Registradas
- Coordenadas selecionadas pelo usuário
- Ajustes aplicados pelo sistema
- Modo utilizado (manual/automático)
- Qualidade da detecção automática

### Metadados no PDF
- Método de posicionamento utilizado
- Coordenadas finais da assinatura
- Informações de processamento
- Timestamp da operação

## 🎯 Resultado Final

Independentemente do método escolhido, o resultado sempre será:
- ✅ **Uniforme**: Aparência consistente
- ✅ **Profissional**: Qualidade visual mantida
- ✅ **Preciso**: Posicionamento exato
- ✅ **Flexível**: Adaptável a qualquer documento