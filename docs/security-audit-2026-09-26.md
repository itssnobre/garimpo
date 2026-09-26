# Auditoria de segurança Lotwise (garimpo), 26/09/2026

Branch: `security-audit-fixes` (local, sem push, sem deploy). Nenhuma migration foi aplicada no Supabase remoto.

## 1. Resumo executivo

O código já passou por endurecimento anterior e a base é boa: RLS por dono em todas as tabelas de usuário, catálogo sem acesso para `anon`/`authenticated`, chave de serviço só no servidor (`server-only`), checagem de origem (CSRF) nas rotas que escrevem, `destinoSeguro` contra open redirect, allowlist de hosts e redirect manual contra SSRF na verificação ao vivo, rate limit nas rotas de IA, sem `dangerouslySetInnerHTML`, `npm audit` limpo e nenhum `.env` jamais commitado.

Foram confirmadas 6 falhas, nenhuma crítica: 1 alta (admin da Lotwise consegue alterar, banir ou apagar contas de OUTROS apps do projeto Supabase compartilhado), 3 médias (rate limit não atômico, Sage aceitando blocos arbitrários do cliente, rotas públicas caras sem limite para visitante) e 2 baixas (view de contagem legível por `anon` com privilégio do dono, header `X-Powered-By`). Todas têm correção aplicada no código ou em migration nova (não aplicada). Typecheck e build passam depois das correções.

## 2. Escopo inspecionado

- `web/`: `package.json`, `next.config.ts`, `proxy.ts` (middleware), todas as rotas em `app/api/**`, `app/auth/callback`, `lib/supabase/*`, `lib/limite.ts`, `lib/origem.ts`, `lib/destino.ts`, `lib/catalogo.ts`, `lib/aovivo/index.ts` e `comum.ts`, `components/Lote.tsx`, `components/Sage.tsx`, `lib/busca.ts`, `app/(site)/entrar`, `scripts/*.mjs`.
- `supabase/migrations/*.sql` (10 arquivos), `supabase/aplicar.sh`, `supabase/ativar-google.sh`.
- `collectors/*.py` (busca por subprocess, shell, SQL, timeouts, segredos), com leitura completa de `publicar_catalogo.py`.
- `.github/workflows/coleta.yml`, `.gitignore` e `web/.gitignore`.
- Arquivos `.env*`: conteúdo NÃO lido, por instrução.

Fora do escopo: configuração real do painel Supabase e Vercel, estado real das grants no banco remoto, teste dinâmico contra produção.

## 3. Vulnerabilidades confirmadas

### 3.1 [ALTA] Admin da Lotwise age sobre contas de outros apps do projeto Supabase compartilhado

- Onde: `web/app/api/admin/usuarios/[id]/route.ts` (GET linha 9, PATCH linha 21, DELETE linha 40, numeração anterior à correção).
- Evidência: a listagem (`route.ts` da pasta pai, linha 24) filtra por quem tem `lotwise_perfis` e o próprio comentário diz que o projeto é compartilhado com outros apps. As rotas por id não fazem esse filtro: recebem qualquer UUID e chamam `admin.auth.admin.updateUserById`, `deleteUser` ou gravam `ban_duration` com a chave de serviço.
- Impacto: qualquer conta com papel `admin` na Lotwise pode trocar e-mail e senha (tomada de conta), banir ou apagar usuários de outros sistemas no mesmo projeto (Trevocode e afins), bastando saber ou descobrir o UUID. O PATCH ainda cria um `lotwise_perfis` para o alvo.
- Causa raiz: autorização por papel sem checagem de escopo do alvo (IDOR entre tenants).
- Correção aplicada: função `ehDaLotwise` que exige `lotwise_perfis` do alvo antes de GET, PATCH e DELETE (404 caso contrário). O PATCH também passou a rejeitar `papel` diferente de `admin`/`cliente` com 400 (antes o banco barrava pelo CHECK, com erro 500).

### 3.2 [MÉDIA] Rate limit não atômico (corrida permite estourar o teto das rotas de IA)

- Onde: `web/lib/limite.ts` linhas 24 a 40 (antes da correção).
- Evidência: lê `contagem`, compara com o teto e depois grava `contagem + 1` com upsert. N requisições simultâneas leem o mesmo valor e todas passam.
- Impacto: o teto de 5 análises de matrícula por dia (Opus, PDF de até 15 MB) e 30 perguntas ao Sage por hora pode ser multiplicado disparando requisições em paralelo, com custo direto na conta Anthropic.
- Correção aplicada: função SQL `lotwise_uso_incrementar` (insert on conflict do update ... returning) na migration nova `supabase/migrations/20260926000000_seguranca_auditoria.sql`, executável só por `service_role`. O código chama a RPC primeiro e, se ela ainda não existir, cai no caminho antigo. Enquanto a migration não for aplicada, a corrida continua.

### 3.3 [MÉDIA] Sage repassa ao modelo mensagens sem validação

- Onde: `web/app/api/sage/route.ts` linhas 41, 42 e 66 (antes da correção).
- Evidência: `mensagens` vinha do JSON do cliente e ia direto para `client.messages.create({ messages: mensagens.slice(-12) })`, só com checagem de `Array.isArray`. O tipo TypeScript não vale em tempo de execução.
- Impacto: um usuário logado podia mandar blocos `document`/`image` (inclusive por URL, buscados pela Anthropic), papéis arbitrários ou conteúdo fora do formato, com custo maior por chamada que o previsto no rate limit. O teto de 32 KB do corpo limita blocos base64, mas não blocos por URL.
- Correção aplicada: toda mensagem precisa ter `role` `user` ou `assistant`, `content` string e no máximo 8.000 caracteres; senão 400. O cliente (`components/Sage.tsx`) já manda exatamente esse formato.

### 3.4 [MÉDIA] Rotas públicas caras sem limite para visitante

- Onde: `web/app/api/busca/route.ts` e `web/app/api/lotes/route.ts`.
- Evidência: as duas rotas ficam fora da lista privada do `proxy.ts`. Um visitante sem conta pode mandar `padrao` e `previa` em `/api/busca`, o que dispara `poolParaMotor` com até 1.500 linhas e `count: exact`, sem limite de frequência. `/api/lotes` devolve o lote completo (`select *`, com `detalhe`) de 60 ids por chamada, também sem limite.
- Impacto: negação de serviço barata contra o banco compartilhado (Project Nobre) e raspagem do catálogo inteiro sem conta, contornando a "amostra de visitante" de 30 itens.
- Correção aplicada: para chamadas SEM sessão, teto de 600 por hora por IP em cada rota (`permitir` com chave `busca-ip:` / `lotes-ip:`, IP de `x-real-ip` ou `x-forwarded-for`, que na Vercel vêm da plataforma). Usuário logado não é afetado. O front já trata resposta não ok (lista vazia), sem quebrar a tela.
- Observação: raspagem continua possível abaixo do teto e trocando de IP. É decisão de negócio se o catálogo deve ser tão aberto (a página `/app/imovel/[id]` também é pública).

### 3.5 [BAIXA] View `lotwise_catalogo_por_uf` com privilégio do dono

- Onde: `supabase/migrations/20260912000000_catalogo.sql`, final do arquivo.
- Evidência: view criada sem `security_invoker`, então roda como o dono e ignora a RLS e os `revoke` do catálogo. Os privilégios padrão do Supabase costumam dar `select` em objetos novos do schema `public` para `anon` e `authenticated`, e a migration não revoga nada na view.
- Impacto (suposto, não verificado no banco remoto): contagem de lotes por UF legível pelo PostgREST com a chave publicável. Dado de baixa sensibilidade, mas é o único objeto do catálogo exposto.
- Correção proposta (na migration nova, não aplicada): `security_invoker = true`, `revoke` de `anon`/`authenticated` e `grant select` para `service_role`. O único uso é `contagemPorUF` em `lib/catalogo.ts`, que roda com a chave de serviço.

### 3.6 [BAIXA] Header `X-Powered-By: Next.js`

- Onde: `web/next.config.ts`.
- Correção aplicada: `poweredByHeader: false`.

### Ajuste de robustez (não é vulnerabilidade)

- `collectors/publicar_catalogo.py` linhas 79 e 97: dois `requests.get` sem `timeout` num script que roda com a chave de serviço no GitHub Actions. Adicionado `timeout=60`.

## 4. Controles verificados como corretos (com evidência)

- Segredos: `git log --all --diff-filter=A` não mostra nenhum `.env*`, `.pem` ou chave adicionada em nenhum momento. `.env*` está nos dois `.gitignore`. Busca por padrões de chave (`sk-ant`, JWT `eyJ`, `sb_secret_`, `sb_publishable_`, `AKIA`, `ghp_`, `GOCSPX-`) no código não achou nada hardcoded.
- Chave de serviço: só em `lib/supabase/admin.ts`, que importa `server-only`. O cliente do navegador usa só `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- ANTHROPIC_API_KEY: lida pelo SDK no servidor. Erros do provedor vão só para o log, sem voltar para o cliente (`sage/route.ts` e `matricula/route.ts`).
- Sessão: `proxy.ts` usa `getClaims()` e as rotas usam `getUser()` (valida no servidor de auth), nunca `getSession()` para decidir acesso. `matricula` checa a sessão dentro da rota, sem depender só do proxy.
- RLS: `lotwise_favoritos`, `padroes`, `pipeline`, `lotes` e `acompanhar` com policy por `auth.uid() = user_id` para select, insert, update e delete, e `revoke all` de `anon`. `lotwise_perfis`: insert só com `papel = 'cliente'`, grant de update só em `nome` e `telefone`, e policy extra impedindo troca de `papel`. `lotwise_uso` e `lotwise_catalogo`: RLS ligada, sem policy e tudo revogado de `anon`/`authenticated`.
- CSRF: `origemOk` em todas as rotas POST, PATCH e DELETE. Nenhum GET altera estado.
- Open redirect: `destinoSeguro` barra `//`, `/\`, esquemas e CRLF, e é usado no login e no callback de e-mail.
- SSRF: `verificarLote` só busca `https` em hosts da lista `DOMINIOS_PERMITIDOS`, com redirect manual (máximo 3 saltos, cada um revalidado) e timeout de 12 s. As URLs vêm do catálogo, não do usuário.
- Injeção PostgREST: `porTermos` quebra o texto com `\W+` (sobram só `[A-Za-z0-9_]`) e ainda remove `%,()*` antes do `.or()`. A busca livre usa `.ilike()` com `%` e `_` neutralizados. `.in()` coloca aspas nos valores com caracteres reservados e os valores vão dentro de um único parâmetro de URL.
- XSS: nenhum `dangerouslySetInnerHTML`, `innerHTML` ou `eval`. Links de fonte raspada passam por `httpOk()` e usam `rel="noreferrer"`. Imagens com `referrerPolicy="no-referrer"`.
- Upload: `matricula` confere a assinatura `%PDF-`, o tamanho (15 MB) e a sessão antes de chamar a IA, com 5 análises por dia por usuário.
- Collectors: `subprocess.run` sempre com lista de argumentos (sem shell). Nenhum SQL montado com string. Credenciais vindas de variável de ambiente ou `web/.env.local`, nunca do código.
- Headers: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy` ativos. CSP em modo report-only (ver riscos).
- Dependências: `npm audit --omit=dev` retornou `found 0 vulnerabilities`. Não há `requirements.txt`: o CI instala `requests beautifulsoup4 lxml` sem versão fixa, então `pip-audit` não se aplica sem lockfile.

## 5. Checagens automáticas (saída real)

Antes das correções: `npm audit --omit=dev` → `found 0 vulnerabilities`; `npx tsc --noEmit` → sem erros.

Depois das correções:

```
$ npx tsc --noEmit        -> saída vazia, exit 0
$ python3 -m py_compile collectors/publicar_catalogo.py -> ok
$ npm run build
▲ Next.js 16.3.3 (Turbopack)
✓ Compiled successfully in 624ms
  Finished TypeScript in 861ms ...
✓ Generating static pages using 9 workers (24/24)
(todas as rotas listadas, incluindo /api/busca, /api/lotes, /api/sage, /api/admin/usuarios/[id])
```

Não existe script de lint no `package.json`. Não rodei teste ponta a ponta contra o servidor local porque o `.env.local` aponta para o Supabase de produção compartilhado, e as rotas de visitante agora gravam em `lotwise_uso`: testar ali seria escrever em produção.

## 6. Riscos remanescentes e suposições não verificadas

- Rate limit falha aberto de propósito (`lib/limite.ts`): sem `SUPABASE_SERVICE_ROLE_KEY` ou com erro no banco, as rotas de IA ficam sem teto. Suposto: a chave existe na Vercel.
- CSP só em report-only e com `'unsafe-inline'`/`'unsafe-eval'`: não protege contra XSS hoje. Próximo passo é CSP com nonce.
- Prompt injection indireta: a descrição raspada de sites de leilão entra no system prompt do Sage (até 1.500 caracteres). O Sage não tem ferramentas, então o pior caso é resposta enganosa ao usuário, não vazamento.
- `/api/conta` (DELETE) apaga o usuário inteiro do Auth. Como o projeto é compartilhado, a pessoa perde também a conta em outros apps do mesmo projeto. Não pede senha de novo antes de apagar.
- `/api/matricula` chama `req.formData()` antes de checar o tamanho. Na Vercel o corpo é limitado a cerca de 4,5 MB pela plataforma (o que também torna o teto de 15 MB inalcançável lá).
- Rotas de admin e `/api/conta` devolvem `error.message` do Supabase ao cliente. Baixo impacto (admin ou o próprio usuário).
- Senha mínima de 6 caracteres na criação por admin. A política do cadastro próprio depende do painel Supabase (não verificado).
- CI (`coleta.yml`): `npx vercel@latest`, actions por tag (`@v4`) e `pip install` sem versão fixa, num job com `SUPABASE_SERVICE_ROLE_KEY` e `VERCEL_TOKEN`. Risco de cadeia de suprimento.
- `supabase/ativar-google.sh` grava o client secret do Google em `/tmp/lotwise-auth-patch.json` por alguns segundos, com permissão padrão do umask. Risco local baixo.
- Observação funcional, não verificada: em `publicar_catalogo.py` o filtro `atualizado_em=lt.{marca}` leva `+00:00` sem codificação na URL. O `+` pode ser lido como espaço pelo PostgREST, e a remoção de lotes que saíram das fontes pode não estar acontecendo. Vale conferir no log do Actions.
- Grants reais da view e de objetos antigos no banco remoto não foram consultados (seria acessar produção).

## 7. Ações manuais necessárias

1. Revisar e aplicar `supabase/migrations/20260926000000_seguranca_auditoria.sql` (por exemplo com `supabase/aplicar.sh`) quando quiser. Até lá, a correção 3.2 fica em modo compatível (caminho antigo) e a 3.5 não vale.
2. No painel Supabase (Project Nobre), rodar o Security Advisor e conferir: `security_definer_view`, extensão `pg_trgm` no schema `public`, tamanho mínimo de senha e proteção contra senha vazada no Auth.
3. Revisar quem tem `papel = 'admin'` em `lotwise_perfis`, já que até esta correção esse papel dava poder sobre contas dos outros apps.
4. Na Vercel, confirmar `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY` só no ambiente de servidor (sem prefixo `NEXT_PUBLIC_`) e definir um teto de gasto no console da Anthropic.
5. Não há indício de vazamento de credencial, então não há rotação obrigatória.
6. Fazer o deploy desta branch só depois de revisar (o deploy é por `npx vercel --prod`, que não rodei).

## Execução 26/09

Autorizada pelo Nobre. Nada foi pushado nem deployado.

1. **Migration `20260926000000_seguranca_auditoria.sql` aplicada em produção** (Project Nobre) com `supabase/aplicar.sh`, embrulhada em `begin; ... commit;`. O script agora lê o token de `~/ArquivoFrio/Projetos/trevocode-gestao/.env.local`. Verificação pela Management API:
   - `lotwise_uso_incrementar(text,timestamptz)`: `security invoker`, `search_path=""`, execute para anon = false, authenticated = false, service_role = true. Teste com `set local role` e `rollback`: service_role devolve 1; anon recebe `permission denied for function lotwise_uso_incrementar`; nenhum resíduo gravado.
   - `lotwise_catalogo_por_uf`: `reloptions = security_invoker=true`; select para anon = false, authenticated = false, service_role = true (27 UFs lidas).
   - As demais migrations do repositório já estavam aplicadas (objetos, índices e policy de `papel` conferidos no banco). Não existe pendência além desta.
2. **Admins da Lotwise**: 1 perfil com `papel = 'admin'` (`its***@gmail.com`, criado em 02/09). Não alterado.
3. **Security Advisor** (`GET /v1/projects/{ref}/advisors/security`, HTTP 200, 26 avisos). Da Lotwise:
   - WARN `function_search_path_mutable`: `public.lotwise_toca_atualizado` (trigger de `atualizado_em`). Não corrigido: fica para uma migration própria (`alter function ... set search_path = ''`).
   - INFO `rls_enabled_no_policy`: `lotwise_catalogo` e `lotwise_uso`. Intencional: só o servidor lê e grava, com service role.
   - `security_definer_view` não aparece mais (a view foi corrigida acima).
   - Do projeto inteiro (não é só da Lotwise): `pg_trgm` e `pg_net` no schema `public`; proteção contra senha vazada desligada no Auth. Funções `security definer` executáveis por anon e authenticated (`agendar_poll`, `handle_new_user`, `is_admin`, `rls_auto_enable`) e tabelas `recovery_*` e `trevopost_*` sem policy são de outros apps e não foram tocadas.
4. **`/api/conta` DELETE exige a senha atual** no corpo (`{ senha }`), conferida com `signInWithPassword` num cliente avulso (sem cookie nem sessão persistida) e com o id do usuário batendo; 5 tentativas por hora por conta (`lotwise_uso`); erro do Supabase não vaza mais ao cliente. A tela de Configurações ganhou o campo "Senha atual" no bloco de exclusão, com aviso para quem entra só com o Google criar uma senha pelo link de recuperação. Textos novos em `lib/i18n/en`.
5. **CI (`coleta.yml`)**: actions fixadas por SHA (checkout v4.4.0 `11d5960`, setup-python v5.6.0 `a26af69`, setup-node v4.4.0 `49933ea`, cache v4.3.0 `0057852`), `pip install requests==2.34.2 beautifulsoup4==4.15.0 lxml==6.1.3`, `npx --yes vercel@59.23.2`. Mantidas as majors atuais; já existem majors novas (checkout v7, setup-python v7, setup-node v7, cache v6) para atualizar com teste.
6. **`publicar_catalogo.py`**: o filtro `atualizado_em=lt.{marca}` vai por `params=`, então o `+00:00` sai como `%2B00%3A00`. `py_compile` ok.
7. **`ativar-google.sh`**: JSON temporário com `mktemp`, `chmod 600` e `trap` que apaga na saída.
8. **CSP**: segue report-only; `'unsafe-eval'` só em desenvolvimento. Teste com `next build` + `next start` e Chrome headless nas rotas `/`, `/entrar`, `/recuperar`, `/app/buscar`, `/app/cobertura`, `/app/configuracoes`, `/app/sugeridos` e página de lote: 0 violações de CSP (rotas `/api` bloqueadas no teste para não gravar em produção). Controle com `eval` injetado no HTML servido gerou a violação `script-src eval report`, então a detecção funciona.
9. **Vercel**: o MCP respondeu 403 para listar variáveis; conferido com `vercel env ls` (só nomes). `SUPABASE_SERVICE_ROLE_KEY` existe como Secret em Production e Preview, sem variante `NEXT_PUBLIC_`. **`ANTHROPIC_API_KEY` não existe no projeto**, então o Sage e a leitura de matrícula (`/api/matricula`) ficam desligados em produção (respondem que falta a chave).
10. `npx tsc --noEmit` e `npm run build` sem erro.
