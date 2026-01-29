# 🔒 ExactSign v2.0 - Segurança e Produção

## 🛡️ Recursos de Segurança

### Rate Limiting
- **Geral**: 100 requisições por 15 minutos
- **Upload**: 10 uploads por 5 minutos
- Headers padronizados para controle

### Validação de Arquivos
- **Documentos**: Apenas .docx válidos
- **Assinaturas**: PNG/JPG até 2MB
- **Integridade**: Verificação de headers ZIP
- **Sanitização**: Nomes de arquivo limpos

### Headers de Segurança (Helmet)
- Content Security Policy configurado
- Proteção XSS e clickjacking
- HSTS para HTTPS
- Remoção de headers sensíveis

### Processamento Seguro
- Diretórios temporários únicos (UUID)
- Limpeza automática de arquivos
- Isolamento por requisição
- Timeouts configurados

## 🚀 Configuração de Produção

### Variáveis de Ambiente
```bash
NODE_ENV=production
PORT=3001
```

### Proxy Reverso (Nginx)
```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        client_max_body_size 50M;
        proxy_timeout 300s;
    }
    
    location / {
        root /caminho/para/web;
        try_files $uri $uri/ /index.html;
    }
}
```

### PM2 (Process Manager)
```bash
npm install -g pm2
pm2 start server.js --name exactsign
pm2 startup
pm2 save
```

## 📊 Monitoramento

### Logs
- Erros são logados no console
- Use ferramentas como Winston para produção
- Monitore uso de CPU/memória

### Health Check
- `GET /api/health` - Status da API
- `GET /api/system-check` - Verificação de dependências

## 🔧 Manutenção

### Limpeza Automática
- Arquivos temporários removidos em 5s
- Diretórios únicos por sessão
- Sem persistência de dados

### Backup
- Não há dados persistentes
- Backup apenas do código fonte
- Configurações em arquivos separados

## ⚠️ Considerações Importantes

1. **LibreOffice**: Necessário para conversão PDF
2. **Memória**: ~100MB por conversão simultânea  
3. **CPU**: Processamento intensivo durante conversão
4. **Rede**: CORS configurado para produção
5. **SSL**: Use HTTPS em produção (Nginx/Cloudflare)