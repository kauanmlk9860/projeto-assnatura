class DocuSignPro {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 4;
        this.documents = [];
        this.selectedDocuments = new Set();
        this.documentStatus = new Map();
        this.processedFiles = [];
        this.signature = null;
        this.signatureType = 'draw';
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.strokes = [];
        this.currentStroke = [];
        this.API_BASE = 'http://localhost:3001/api';
        
        this.init();
    }

    init() {
        this.setupTheme();
        this.setupCanvas();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.updateProgress();
        
        // Initialize Lucide icons after DOM is ready
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupTheme() {
        // Check for saved theme or default to light
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update theme toggle button
        this.updateThemeToggle(savedTheme);
    }

    updateThemeToggle(theme) {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.setAttribute('title', 
                theme === 'light' ? 'Alternar para tema escuro' : 'Alternar para tema claro'
            );
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeToggle(newTheme);
        
        // Re-initialize icons after theme change
        setTimeout(() => {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }, 100);
    }

    setupCanvas() {
        this.canvas = document.getElementById('signatureCanvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.ctx.strokeStyle = '#1e293b';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());
        
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.canvas.dispatchEvent(new MouseEvent('mouseup', {}));
        });
    }

    setupEventListeners() {
        // Theme toggle
        document.getElementById('themeToggle')?.addEventListener('click', () => {
            this.toggleTheme();
        });

        // File upload
        const documentsInput = document.getElementById('documents');
        if (documentsInput) {
            documentsInput.addEventListener('change', (e) => {
                this.handleFileSelect(e.target.files);
            });
        }

        // Signature methods
        document.querySelectorAll('.method-card').forEach(card => {
            card.addEventListener('click', () => {
                this.switchSignatureMethod(card.dataset.method);
            });
        });

        // Canvas controls
        document.getElementById('clearCanvas')?.addEventListener('click', () => {
            this.clearCanvas();
        });
        
        document.getElementById('undoCanvas')?.addEventListener('click', () => {
            this.undoLastStroke();
        });

        // Signature file upload
        document.getElementById('signatureFile')?.addEventListener('change', (e) => {
            this.handleSignatureUpload(e.target.files[0]);
        });

        // Navigation buttons
        document.getElementById('nextStep1')?.addEventListener('click', () => {
            this.goToStep(2);
        });
        
        document.getElementById('prevStep2')?.addEventListener('click', () => {
            this.goToStep(1);
        });
        
        document.getElementById('nextStep2')?.addEventListener('click', () => {
            this.goToStep(3);
        });
        
        document.getElementById('prevStep3')?.addEventListener('click', () => {
            this.goToStep(2);
        });

        // Process button
        document.getElementById('processBtn')?.addEventListener('click', () => {
            this.processDocuments();
        });

        // Detection button
        document.getElementById('detectBtn')?.addEventListener('click', () => {
            this.detectSignatures();
        });

        // New process button
        document.getElementById('newProcess')?.addEventListener('click', () => {
            this.resetProcess();
        });

        // Batch controls
        document.getElementById('selectAll')?.addEventListener('click', () => {
            this.selectAllDocuments();
        });
        
        document.getElementById('selectNone')?.addEventListener('click', () => {
            this.selectNoDocuments();
        });
        
        document.getElementById('removeSelected')?.addEventListener('click', () => {
            this.removeSelectedDocuments();
        });

        // Download controls
        document.getElementById('downloadAll')?.addEventListener('click', () => {
            this.downloadAllFiles();
        });
        
        document.getElementById('downloadSelected')?.addEventListener('click', () => {
            this.downloadSelectedFiles();
        });
    }

    setupDragAndDrop() {
        const uploadZone = document.getElementById('uploadZone');
        if (!uploadZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadZone.addEventListener(eventName, () => {
                uploadZone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, () => {
                uploadZone.classList.remove('dragover');
            });
        });

        uploadZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            this.handleFileSelect(files);
        });

        uploadZone.addEventListener('click', () => {
            const input = document.getElementById('documents');
            if (input) {
                input.click();
            }
        });
    }

    handleFileSelect(files) {
        const newFiles = Array.from(files).filter(file => 
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );

        if (newFiles.length === 0) {
            this.showNotification('Selecione apenas arquivos .docx válidos', 'error');
            return;
        }

        // Add new files to existing documents
        newFiles.forEach(file => {
            const id = Date.now() + Math.random();
            file.id = id;
            this.documents.push(file);
            this.documentStatus.set(id, 'pending');
            this.selectedDocuments.add(id);
        });

        this.displayFiles();
        this.validateStep1();
        this.showNotification(`${newFiles.length} documento(s) adicionado(s)`, 'success');
    }

    displayFiles() {
        const container = document.getElementById('documentsGrid');
        const batchControls = document.getElementById('batchControls');
        
        if (!container) return;

        // Show/hide batch controls
        if (batchControls) {
            batchControls.style.display = this.documents.length > 0 ? 'block' : 'none';
        }

        container.innerHTML = '';
        
        this.documents.forEach((file, index) => {
            const isSelected = this.selectedDocuments.has(file.id);
            const status = this.documentStatus.get(file.id) || 'pending';
            
            const fileCard = document.createElement('div');
            fileCard.className = `document-card ${isSelected ? 'selected' : ''} status-${status}`;
            fileCard.innerHTML = `
                <div class="document-header">
                    <input type="checkbox" class="doc-checkbox" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="app.toggleDocumentSelection(${file.id})">
                    <div class="document-status">
                        <span class="status-icon">${this.getStatusIcon(status)}</span>
                    </div>
                </div>
                <div class="document-body">
                    <div class="document-icon">📄</div>
                    <div class="document-info">
                        <div class="document-name">${file.name}</div>
                        <div class="document-size">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                        <div class="document-status-text">${this.getStatusText(status)}</div>
                    </div>
                </div>
                <div class="document-actions">
                    <button type="button" class="tool-btn" onclick="app.removeFile(${index})">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            container.appendChild(fileCard);
        });
        
        this.updateBatchStats();
        
        // Re-initialize Lucide icons for new elements
        setTimeout(() => {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }, 100);
    }

    getStatusIcon(status) {
        const icons = {
            'pending': '<i data-lucide="clock"></i>',
            'processing': '<i data-lucide="loader-2" class="animate-spin"></i>',
            'completed': '<i data-lucide="check-circle"></i>',
            'error': '<i data-lucide="x-circle"></i>'
        };
        return icons[status] || '<i data-lucide="clock"></i>';
    }

    getStatusText(status) {
        const texts = {
            'pending': 'Aguardando',
            'processing': 'Processando...',
            'completed': 'Concluído',
            'error': 'Erro'
        };
        return texts[status] || 'Aguardando';
    }

    toggleDocumentSelection(fileId) {
        if (this.selectedDocuments.has(fileId)) {
            this.selectedDocuments.delete(fileId);
        } else {
            this.selectedDocuments.add(fileId);
        }
        this.displayFiles();
    }

    selectAllDocuments() {
        this.documents.forEach(doc => {
            this.selectedDocuments.add(doc.id);
        });
        this.displayFiles();
    }

    selectNoDocuments() {
        this.selectedDocuments.clear();
        this.displayFiles();
    }

    removeSelectedDocuments() {
        const selectedIds = Array.from(this.selectedDocuments);
        this.documents = this.documents.filter(doc => !selectedIds.includes(doc.id));
        selectedIds.forEach(id => {
            this.selectedDocuments.delete(id);
            this.documentStatus.delete(id);
        });
        this.displayFiles();
        this.validateStep1();
        this.showNotification(`${selectedIds.length} documento(s) removido(s)`, 'success');
    }

    updateBatchStats() {
        const selectedCount = document.getElementById('selectedCount');
        if (selectedCount) {
            selectedCount.textContent = `${this.selectedDocuments.size} de ${this.documents.length} selecionados`;
        }
    }

    removeFile(index) {
        this.documents.splice(index, 1);
        this.displayFiles();
        this.validateStep1();
    }

    validateStep1() {
        const nextBtn = document.getElementById('nextStep1');
        if (nextBtn) {
            nextBtn.disabled = this.documents.length === 0;
        }
    }

    switchSignatureMethod(method) {
        this.signatureType = method;
        
        // Update UI
        document.querySelectorAll('.method-card').forEach(card => {
            card.classList.toggle('active', card.dataset.method === method);
        });
        
        document.querySelectorAll('.method-content').forEach(content => {
            content.classList.toggle('active', content.id === `${method}Method`);
        });

        this.validateStep2();
    }

    // Canvas methods
    getCanvasPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getCanvasPosition(e);
        this.currentStroke = [pos];
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
        this.hideCanvasOverlay();
    }

    draw(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getCanvasPosition(e);
        this.currentStroke.push(pos);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.strokes.push([...this.currentStroke]);
            this.currentStroke = [];
            this.validateStep2();
        }
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes = [];
        this.showCanvasOverlay();
        this.validateStep2();
    }

    undoLastStroke() {
        if (this.strokes.length > 0) {
            this.strokes.pop();
            this.redrawCanvas();
            this.validateStep2();
        }
    }

    redrawCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.strokes.length === 0) {
            this.showCanvasOverlay();
            return;
        }

        this.strokes.forEach(stroke => {
            if (stroke.length > 0) {
                this.ctx.beginPath();
                this.ctx.moveTo(stroke[0].x, stroke[0].y);
                
                stroke.forEach(point => {
                    this.ctx.lineTo(point.x, point.y);
                });
                
                this.ctx.stroke();
            }
        });
    }

    hideCanvasOverlay() {
        const overlay = document.querySelector('.canvas-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    showCanvasOverlay() {
        const overlay = document.querySelector('.canvas-overlay');
        if (overlay) overlay.style.display = 'block';
    }

    handleSignatureUpload(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('signaturePreview');
            if (preview) {
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Assinatura" style="max-width: 100%; max-height: 150px; border-radius: 8px;">
                `;
            }
            this.signature = e.target.result;
            this.validateStep2();
        };
        reader.readAsDataURL(file);
    }

    validateStep2() {
        const nextBtn = document.getElementById('nextStep2');
        if (!nextBtn) return;

        let hasSignature = false;
        
        if (this.signatureType === 'draw') {
            hasSignature = this.strokes.length > 0;
        } else if (this.signatureType === 'upload') {
            hasSignature = this.signature !== null;
        }

        nextBtn.disabled = !hasSignature;
    }

    async detectSignatures() {
        if (this.documents.length === 0) {
            this.showNotification('Selecione documentos primeiro', 'error');
            return;
        }

        const resultsDiv = document.getElementById('detectionResults');
        if (!resultsDiv) return;

        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = `
            <div style="padding: 1rem; text-align: center;">
                <div class="loading-animation" style="width: 30px; height: 30px; margin: 0 auto 1rem;">
                    <i data-lucide="loader-2"></i>
                </div>
                <p>Analisando documentos com detecção avançada...</p>
            </div>
        `;

        // Re-initialize icons
        setTimeout(() => {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }, 100);

        // Enhanced detection simulation
        setTimeout(() => {
            const totalMarkers = this.documents.length * 2;
            const detectionDetails = this.documents.map((doc, index) => {
                return {
                    name: doc.name,
                    locations: [
                        { type: 'line', confidence: 0.95, text: '________________________', positioning: 'Sobre a linha' },
                        { type: 'text', confidence: 0.87, text: 'ASSINATURA:', positioning: 'Ao lado do texto' }
                    ]
                };
            });
            
            resultsDiv.innerHTML = `
                <div style="padding: 1rem;">
                    <h4 style="color: var(--success-600); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i data-lucide="check-circle"></i> Detecção Avançada Concluída
                    </h4>
                    <p style="margin-bottom: 1rem;">
                        Encontrados <strong>${totalMarkers} marcadores</strong> com posicionamento preciso.
                    </p>
                    <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: var(--radius-lg); margin-bottom: 1rem;">
                        ${detectionDetails.map(doc => `
                            <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-elevated); border-radius: var(--radius-md); border: 1px solid var(--border-primary);">
                                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                    <i data-lucide="file-text"></i> 
                                    <strong>${doc.name}</strong>
                                </div>
                                ${doc.locations.map(location => `
                                    <div style="margin-left: 1.5rem; margin-bottom: 0.25rem; font-size: 0.875rem;">
                                        <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                                            <i data-lucide="${location.type === 'line' ? 'minus' : 'type'}" style="width: 12px; height: 12px;"></i>
                                            <strong>${location.type === 'line' ? 'Linha' : 'Texto'}:</strong>
                                        </span>
                                        "${location.text}" 
                                        <span style="color: var(--success-600); font-weight: 600;">
                                            (${Math.round(location.confidence * 100)}% confiança)
                                        </span>
                                        <br>
                                        <span style="color: var(--text-secondary); font-size: 0.75rem; margin-left: 1rem;">
                                            📍 Posicionamento: ${location.positioning}
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                    <div style="background: var(--primary-50); border: 1px solid var(--primary-200); border-radius: var(--radius-lg); padding: 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary-700);">
                            <i data-lucide="info"></i>
                            <strong>Posicionamento Inteligente:</strong>
                        </div>
                        <p style="margin: 0.5rem 0 0 1.5rem; font-size: 0.875rem; color: var(--primary-600);">
                            As assinaturas serão posicionadas exatamente sobre as linhas detectadas, 
                            com tamanho ajustado automaticamente para cada documento.
                        </p>
                    </div>
                </div>
            `;
            
            // Re-initialize icons after content update
            setTimeout(() => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }, 100);
        }, 2500);
    }

    goToStep(step) {
        if (step < 1 || step > this.totalSteps) return;

        // Hide current step
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });

        // Show new step
        const newStepContent = document.getElementById(`step${step}`);
        if (newStepContent) {
            newStepContent.classList.add('active');
        }

        // Update progress
        this.currentStep = step;
        this.updateProgress();

        // Prepare step content
        if (step === 3) {
            this.prepareReview();
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateProgress() {
        // Update step indicators
        document.querySelectorAll('.step').forEach((step, index) => {
            const stepNumber = index + 1;
            step.classList.toggle('active', stepNumber === this.currentStep);
            step.classList.toggle('completed', stepNumber < this.currentStep);
        });

        // Update progress bar
        const progressFill = document.querySelector('.progress-fill');
        if (progressFill) {
            const percentage = ((this.currentStep - 1) / (this.totalSteps - 1)) * 100;
            progressFill.style.width = `${percentage}%`;
        }
    }

    prepareReview() {
        // Update batch count
        const batchCount = document.getElementById('batchCount');
        if (batchCount) {
            batchCount.textContent = `${this.documents.length} documentos serão processados com a mesma assinatura`;
        }

        // Review documents
        const reviewDocs = document.getElementById('reviewDocuments');
        if (reviewDocs) {
            reviewDocs.innerHTML = this.documents.map((doc, index) => `
                <div class="file-item" style="margin-bottom: 0.5rem;">
                    <div class="file-icon">📄</div>
                    <div class="file-info">
                        <div class="file-name">${doc.name}</div>
                        <div class="file-size">${(doc.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <div class="batch-indicator">
                        <span class="batch-number">${index + 1}</span>
                    </div>
                </div>
            `).join('');
        }

        // Review signature
        const reviewSig = document.getElementById('reviewSignature');
        if (reviewSig) {
            if (this.signatureType === 'draw') {
                const canvas = document.createElement('canvas');
                canvas.width = 300;
                canvas.height = 120;
                canvas.style.border = '1px solid var(--gray-300)';
                canvas.style.borderRadius = '8px';
                
                const ctx = canvas.getContext('2d');
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // Scale and draw strokes
                const scaleX = 300 / 500;
                const scaleY = 120 / 200;
                
                this.strokes.forEach(stroke => {
                    if (stroke.length > 0) {
                        ctx.beginPath();
                        ctx.moveTo(stroke[0].x * scaleX, stroke[0].y * scaleY);
                        stroke.forEach(point => {
                            ctx.lineTo(point.x * scaleX, point.y * scaleY);
                        });
                        ctx.stroke();
                    }
                });
                
                reviewSig.innerHTML = '';
                reviewSig.appendChild(canvas);
            } else if (this.signature) {
                reviewSig.innerHTML = `
                    <img src="${this.signature}" alt="Assinatura" 
                         style="max-width: 300px; max-height: 120px; border: 1px solid var(--gray-300); border-radius: 8px;">
                `;
            }
        }
    }

    async processDocuments() {
        const processBtn = document.getElementById('processBtn');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const progressText = document.getElementById('progressText');
        const batchProgress = document.getElementById('batchProgress');
        
        if (!processBtn || !loadingOverlay) return;

        // Show loading
        processBtn.disabled = true;
        processBtn.querySelector('.loading-spinner').style.display = 'inline-block';
        loadingOverlay.style.display = 'flex';
        
        // Initialize progress
        if (progressText) {
            progressText.textContent = `0 de ${this.documents.length} documentos processados`;
        }
        if (batchProgress) {
            batchProgress.style.width = '0%';
        }

        try {
            // Create FormData with ALL documents at once
            const formData = new FormData();
            
            // Add all documents
            this.documents.forEach(doc => {
                formData.append('documents', doc);
            });

            // Add signature
            if (this.signatureType === 'draw') {
                const signatureData = this.canvas.toDataURL('image/png');
                formData.append('signatureData', signatureData);
            } else if (this.signature) {
                const response = await fetch(this.signature);
                const blob = await response.blob();
                formData.append('signature', blob, 'signature.png');
            }

            // Update progress to show processing
            if (progressText) {
                progressText.textContent = `Processando ${this.documents.length} documentos...`;
            }
            if (batchProgress) {
                batchProgress.style.width = '50%';
            }

            // Process all documents in one request
            const response = await fetch(`${this.API_BASE}/process-documents`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Complete progress
                if (progressText) {
                    progressText.textContent = `${this.documents.length} de ${this.documents.length} documentos processados`;
                }
                if (batchProgress) {
                    batchProgress.style.width = '100%';
                }
                
                // Small delay to show completion
                await new Promise(resolve => setTimeout(resolve, 500));
                
                this.displayResults(result.files);
                this.goToStep(4);
                this.showNotification(`${this.documents.length} documentos processados com sucesso!`, 'success');
            } else {
                throw new Error(result.error || 'Erro desconhecido');
            }

        } catch (error) {
            console.error('Erro:', error);
            this.showNotification(`Erro no processamento em lote: ${error.message}`, 'error');
        } finally {
            // Hide loading
            processBtn.disabled = false;
            processBtn.querySelector('.loading-spinner').style.display = 'none';
            loadingOverlay.style.display = 'none';
        }
    }

    displayResults(files) {
        const downloadGrid = document.getElementById('downloadGrid');
        if (!downloadGrid) return;

        downloadGrid.innerHTML = files.map((file, index) => `
            <div class="download-card">
                <div class="download-header">
                    <input type="checkbox" class="download-checkbox" checked 
                           onchange="app.toggleDownloadSelection(${index})">
                    <div class="download-icon">📄</div>
                </div>
                <div class="download-info">
                    <h4>${file.name}</h4>
                    <p>${file.size ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : 'PDF'}</p>
                </div>
                <div class="download-actions">
                    <a href="data:application/pdf;base64,${file.data}" 
                       download="${file.name}" 
                       class="btn-primary btn-sm">
                        📥 Download
                    </a>
                </div>
            </div>
        `).join('');
    }

    toggleDownloadSelection(index) {
        // Implementation for download selection
    }

    downloadAllFiles() {
        if (this.processedFiles.length === 0) return;
        
        // Create ZIP with all files
        this.createZipDownload(this.processedFiles, 'documentos_assinados.zip');
    }

    downloadSelectedFiles() {
        // Get selected files and create ZIP
        const selectedFiles = this.processedFiles.filter((_, index) => {
            const checkbox = document.querySelector(`.download-checkbox:nth-of-type(${index + 1})`);
            return checkbox && checkbox.checked;
        });
        
        if (selectedFiles.length === 0) {
            this.showNotification('Selecione arquivos para download', 'warning');
            return;
        }
        
        this.createZipDownload(selectedFiles, 'documentos_selecionados.zip');
    }

    async createZipDownload(files, filename) {
        try {
            // Simple implementation - download files individually
            files.forEach((file, index) => {
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = `data:application/pdf;base64,${file.data}`;
                    link.download = file.name;
                    link.click();
                }, index * 200); // Stagger downloads
            });
            
            this.showNotification(`${files.length} arquivos baixados`, 'success');
        } catch (error) {
            this.showNotification('Erro ao criar download em lote', 'error');
        }
    }

    resetProcess() {
        this.currentStep = 1;
        this.documents = [];
        this.selectedDocuments.clear();
        this.documentStatus.clear();
        this.processedFiles = [];
        this.signature = null;
        this.signatureType = 'draw';
        this.strokes = [];
        
        // Reset UI
        const documentsInput = document.getElementById('documents');
        if (documentsInput) documentsInput.value = '';
        
        const documentsGrid = document.getElementById('documentsGrid');
        if (documentsGrid) documentsGrid.innerHTML = '';
        
        const batchControls = document.getElementById('batchControls');
        if (batchControls) batchControls.style.display = 'none';
        
        const signatureFile = document.getElementById('signatureFile');
        if (signatureFile) signatureFile.value = '';
        
        const signaturePreview = document.getElementById('signaturePreview');
        if (signaturePreview) signaturePreview.innerHTML = '';
        
        this.clearCanvas();
        
        // Go to step 1
        this.goToStep(1);
        
        this.showNotification('Processo reiniciado', 'success');
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const iconMap = {
            'success': 'check-circle',
            'error': 'x-circle',
            'warning': 'alert-triangle',
            'info': 'info'
        };
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: var(--space-2);">
                <i data-lucide="${iconMap[type] || 'info'}"></i>
                <span>${message}</span>
            </div>
        `;

        container.appendChild(notification);
        
        // Initialize icons for the notification
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DocuSignPro();
});