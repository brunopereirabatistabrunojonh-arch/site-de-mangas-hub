# MangáHub — site para publicar e ler mangás originais

Site completo com cadastro de usuários, publicação de mangás, upload de
capítulos (várias páginas de imagem), leitor otimizado pra celular,
favoritos, comentários e perfis públicos de autor.

**Stack**: Node.js + Express + SQLite (banco de dados em arquivo único,
não precisa instalar nenhum banco separado) + EJS (templates) + sessões
com cookie. Sem framework de frontend pesado — carrega rápido em qualquer
celular.

---

## 1. Rodando localmente

Requer [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
cd manga_site
npm install
npm start
```

Acesse `http://localhost:3000` no navegador. Pronto — já dá pra criar
conta, publicar um mangá e testar tudo localmente antes de publicar de
verdade.

---

## 2. Estrutura do projeto

```
manga_site/
├── server.js          # todas as rotas (login, cadastro, mangás, capítulos...)
├── db.js              # schema do banco SQLite (cria as tabelas automaticamente)
├── package.json
├── views/             # templates EJS (HTML)
│   ├── partials/       # cabeçalho, rodapé, flash messages
│   ├── home.ejs, login.ejs, register.ejs, dashboard.ejs, library.ejs,
│   ├── profile.ejs, manga_form.ejs, manga_detail.ejs,
│   └── chapter_form.ejs, chapter_reader.ejs, 404.ejs
├── public/
│   ├── css/style.css   # todo o visual do site (tema escuro, responsivo)
│   └── uploads/         # capas e páginas de capítulo enviadas pelos usuários
└── data/manga.db        # banco de dados (criado automaticamente na 1ª execução)
```

---

## 3. Funcionalidades

- **Cadastro / login** com senha criptografada (bcrypt) e sessão por cookie (30 dias).
- **Qualquer usuário cadastrado pode publicar** seus próprios mangás (é uma
  plataforma comunitária, não precisa de aprovação de admin — se quiser
  restringir isso, veja a seção 6).
- **Publicar mangá**: título, sinopse, gênero, status (em andamento / completo / hiato), capa.
- **Capítulos**: upload de várias imagens de uma vez (as páginas, na ordem
  que forem selecionadas). Suporta números fracionários (ex: 5.5) pra
  capítulos especiais.
- **Leitor**: rolagem vertical contínua (like Webtoon/Manga Plus), com
  botões de capítulo anterior/próximo e link de volta pro índice.
- **Favoritos**: leitores podem favoritar mangás e ver tudo em "Minha Biblioteca".
- **Comentários** por mangá.
- **Perfil público** de cada autor, listando os mangás publicados.
- **Busca** por título/gênero na home.
- Cada autor só pode editar/excluir/postar capítulo nos **próprios** mangás
  (testado e validado — outros usuários recebem erro 403).

---

## 4. Publicando o site de verdade (deploy)

Este é um app Node.js comum, então roda em qualquer serviço que hospede
Node. Algumas opções gratuitas/baratas pra começar:

### Opção recomendada: Render.com
1. Crie uma conta em [render.com](https://render.com) e conecte seu GitHub
   (suba esta pasta pra um repositório no GitHub primeiro).
2. "New +" → "Web Service" → selecione o repositório.
3. Build command: `npm install` — Start command: `npm start`.
4. **Importante**: em "Disks", adicione um disco persistente montado em
   `/opt/render/project/src/data` e outro em
   `/opt/render/project/src/public/uploads` (ou o caminho equivalente do
   seu projeto). Sem isso, o banco de dados e as imagens enviadas somem
   toda vez que o serviço reiniciar/reimplantar — planos gratuitos de
   muitos serviços usam sistema de arquivos temporário.
5. Configure a variável de ambiente `SESSION_SECRET` com um valor
   aleatório longo (veja seção 5).

### Alternativas
- **Railway.app** — parecido com o Render, também suporta volumes persistentes.
- **Fly.io** — mais técnico, mas tem "volumes" persistentes gratuitos pequenos.
- **VPS próprio** (DigitalOcean, Hetzner, Contabo) — você tem controle
  total do disco, então não tem esse problema de persistência. Rode com
  `pm2` ou um serviço systemd pra manter o app sempre no ar, e um
  Nginx na frente pra HTTPS.

### Sobre o domínio
Qualquer um desses serviços te dá uma URL gratuita tipo
`seusite.onrender.com`. Se quiser um domínio próprio (`seusite.com`),
compre em qualquer registrador (Registro.br, Namecheap, etc.) e aponte
pro serviço escolhido — cada um tem um passo a passo próprio pra isso.

---

## 5. Antes de publicar de verdade (checklist de segurança)

- [ ] Troque `SESSION_SECRET` (em `server.js`, ou defina a variável de
      ambiente `SESSION_SECRET`) por um valor longo e aleatório.
- [ ] Sirva o site com HTTPS (os serviços da seção 4 já fazem isso
      automaticamente).
- [ ] Faça backup do arquivo `data/manga.db` periodicamente (é o banco
      inteiro em um único arquivo, fácil de copiar).
- [ ] Se o site crescer bastante, considere migrar as imagens pra um
      serviço de armazenamento externo (Cloudflare R2, Backblaze B2, AWS
      S3) em vez de disco local — fica mais barato e escalável.

---

## 6. Ideias pra evoluir (próximos passos)

- Painel de moderação (denunciar mangá/comentário impróprio).
- Aprovação manual de novos mangás antes de aparecerem publicamente.
- Sistema de tags mais robusto (múltiplos gêneros por mangá).
- Notificações quando um mangá favoritado recebe capítulo novo.
- Modo leitor paginado (além do scroll contínuo) com atalhos de teclado.
- Upload de capas/páginas direto de um app mobile (hoje é só pelo navegador).

---

Testei manualmente todo o fluxo antes de entregar: cadastro, login,
criar/editar/excluir mangá, upload de capítulo com várias páginas,
leitura, prevenção de capítulo duplicado, permissões (usuário não pode
mexer no mangá alheio), favoritos, comentários, perfil público e páginas
de erro — tudo passou. Bom mangá! 📖
