vol# Configuração da Autenticação com Supabase

## 📋 Passo a Passo para Configurar a Autenticação

### 1. Configurar as Credenciais do Supabase ✅

**✅ Já configurado!** Suas credenciais já estão no arquivo `src/services/supabase.ts`.

### 2. Configurar Permissões na Tabela 'usuario'

Como você já tem uma tabela `usuario` com a coluna `funcao`, precisamos apenas garantir que o Supabase Auth possa acessá-la:

1. No painel do Supabase, vá em **SQL Editor**
2. Execute este script para configurar as permissões:

```sql
-- Configurar Row Level Security (RLS) na tabela usuario
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;

-- Política para usuários autenticados lerem dados da tabela usuario
CREATE POLICY "Authenticated users can view usuario" ON usuario
  FOR SELECT USING (auth.role() = 'authenticated');

-- Se sua tabela usuario não tem uma coluna 'id' que corresponde ao auth.users.id,
-- você pode precisar criar uma ligação entre as tabelas
```

### 3. Regras de Função Implementadas ✅

O sistema agora reconhece automaticamente:
- **Gestor**: usuários com `funcao = 'gestor'` OU `funcao = 'supervisor'`
- **Técnico**: todos os outros usuários

### 4. Testar a Autenticação

1. Execute o app: `npm start`
2. Tente fazer login com usuários existentes na sua tabela `usuario`
3. Verifique se:
   - O login funciona corretamente
   - Os dados do usuário aparecem no perfil
   - O logout funciona
   - Usuários com função 'gestor' ou 'supervisor' veem a tela de Manager
   - Outros usuários veem a tela padrão

## 🔧 Funcionalidades Implementadas

### ✅ Login/Logout
- Autenticação via email/senha usando Supabase Auth
- Integração com sua tabela `usuario` existente
- Redirecionamento automático após login
- Logout com confirmação
- Gerenciamento de sessão persistente

### ✅ Proteção de Rotas
- Usuários não autenticados veem apenas a tela de login
- Redirecionamento automático baseado no estado da autenticação

### ✅ Tipos de Usuário com sua Regra de Negócio
- **Gestor**: Usuários com `funcao = 'gestor'` OU `funcao = 'supervisor'`
  - Acesso à tela de gerenciamento (ManagerScreen)
- **Técnico**: Todos os outros usuários
  - Acesso à tela principal (MainScreen)

### ✅ Perfil do Usuário
- Exibição de dados da tabela `usuario`
- Botão de logout no cabeçalho
- Integração com dados do Supabase

## 📊 Estrutura da Tabela Usuario

O sistema busca os seguintes campos na sua tabela `usuario`:
- `id` - ID do usuário (preferencialmente igual ao auth.users.id)
- `email` - Email para busca alternativa
- `nome` ou `name` - Nome do usuário
- `funcao` - Função do usuário (gestor/supervisor = Gestor, outros = Técnico)

## 🐛 Solução de Problemas

### Erro: "Invalid login credentials"
- Verifique se o usuário existe na tabela Auth do Supabase
- Confirme se email e senha estão corretos no Supabase Auth

### Erro: "Failed to fetch"
- Verifique se as credenciais do Supabase estão corretas
- Confirme se a URL e chave API estão configuradas

### Usuário não aparece ou dados vazios
- Verifique se a tabela `usuario` tem RLS configurado corretamente
- Confirme se o usuário existe na tabela `usuario`
- Verifique se o `id` na tabela `usuario` corresponde ao ID do Supabase Auth

### Usuário comum aparece como Gestor
- Verifique se a coluna `funcao` está preenchida corretamente
- Lembre-se: 'gestor' e 'supervisor' são considerados gestores

## 📱 Estrutura da Autenticação

```
src/
├── contexts/
│   └── AuthContext.tsx     # Contexto global de autenticação
├── services/
│   └── supabase.ts         # Configuração do cliente Supabase
├── types/
│   └── auth.ts             # Tipos TypeScript para autenticação
└── screens/
    ├── LoginScreen.tsx     # Tela de login
    └── ProfileScreen.tsx   # Tela de perfil com logout
```

## 🔐 Segurança

- ✅ Row Level Security (RLS) habilitado
- ✅ Políticas de acesso para usuários autenticados
- ✅ Tokens JWT automáticos
- ✅ Persistência segura de sessão
- ✅ Validação de tipos TypeScript 
- ✅ Integração com tabela existente 