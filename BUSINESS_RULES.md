# Regras de Negócio - Sistema de Ordens de Serviço

## Visão Geral

O sistema implementa diferentes visualizações baseadas no tipo de usuário logado, seguindo as regras de negócio específicas para cada perfil.

## Tipos de Usuário

### 1. Técnico (`userType: 'tecnico'`)
**Visualização:** Tela MainScreen (Lista de OS)
- Exibe lista de ordens de serviço individuais
- Filtros por status (TODAS, AGUARDANDO, EM PROGRESSO, etc.)
- Foco em tarefas operacionais específicas
- Acesso individual às OS

### 2. Gestor (`userType: 'gestor'`)
**Visualização:** Tela ManagerScreen (Dashboard Gerencial)
- Exibe estatísticas gerais consolidadas
- Gráfico de pizza com distribuição das OS
- Indicadores de performance (Executadas, Atrasadas, Pendentes)
- Visão macro para tomada de decisões

## Implementação da Regra

### Lógica de Autenticação
```typescript
// App.tsx - Função handleLogin
const handleLogin = (email: string, password: string) => {
  const authenticatedUser = mockUsers[email.toLowerCase()];
  
  if (authenticatedUser) {
    setUser(authenticatedUser);
    // Usuário será direcionado conforme seu userType
  } else {
    // Usuário padrão (técnico) para demonstração
  }
};
```

### Renderização Condicional
```typescript
// App.tsx - Função renderMainScreen
const renderMainScreen = () => {
  if (user.userType === 'gestor') {
    return <ManagerScreen user={user} onTabPress={handleTabPress} />;
  } else {
    return <MainScreen user={user} onTabPress={handleTabPress} />;
  }
};
```

## Usuários Mockados para Teste

### Gestor
- **Email:** `gestor@teste.com`
- **Senha:** qualquer senha
- **Nome:** João Silva
- **Função:** Gestor
- **Visualização:** Dashboard com gráficos e estatísticas

### Técnico
- **Email:** `tecnico@teste.com`
- **Senha:** qualquer senha
- **Nome:** Maria Santos
- **Função:** Técnico
- **Visualização:** Lista de ordens de serviço

### Usuário Padrão
- **Email:** qualquer outro email
- **Senha:** qualquer senha
- **Nome:** Usuário Padrão
- **Função:** Técnico
- **Visualização:** Lista de ordens de serviço

## Diferenças nas Telas

### MainScreen (Técnico)
- **Background:** Cinza claro
- **Header:** Informações básicas do usuário
- **Conteúdo:** 
  - Barra de pesquisa
  - Filtros de status
  - Lista scrollável de OS
- **Foco:** Operacional/Individual

### ManagerScreen (Gestor)
- **Background:** Gradiente azul
- **Header:** Informações do usuário
- **Conteúdo:**
  - Estatísticas consolidadas
  - Gráfico de pizza com percentuais
  - Indicadores coloridos (Executadas, Atrasadas, Pendentes)
  - Data de última atualização
  - Seção inferior com lista resumida de OS
- **Foco:** Gerencial/Estratégico

## Componentes Específicos

### Para Gestores
- `ManagerStatsCard`: Card com gráfico de pizza e indicadores
- `ManagerScreen`: Tela completa com layout gerencial

### Para Técnicos
- `FilterTabs`: Filtros por status das OS
- `MainScreen`: Lista focada em tarefas individuais

## Navegação

Ambos os tipos de usuário têm acesso às mesmas funcionalidades de navegação:
- **Home:** Tela principal (diferente conforme tipo)
- **Perfil:** Tela de perfil (igual para ambos)
- **Logout:** Retorno à tela de login

## Dados Exibidos

### Estatísticas do Gestor
- **OS Avaliadas:** Total de ordens avaliadas
- **Ranqueamento:** Nota média (0.0 - 5.0)
- **Distribuição:** Percentuais de Executadas (39%), Atrasadas (41%), Pendentes (20%)
- **Última Atualização:** Data da última sincronização

### Lista do Técnico
- **OS Individuais:** ID, título, cliente, endereço
- **Prioridade:** Alta (vermelho), Média (amarelo), Baixa (verde)
- **Status:** Aguardando, Em Progresso, Finalizada, etc.
- **Ações:** Visualizar e atualizar cada OS

## Considerações Técnicas

- **Tipagem TypeScript:** Interface `User` inclui campo `userType`
- **Componentes Reutilizáveis:** Header, SearchBar, BottomNavigation
- **Estados Separados:** Cada tela gerencia seus próprios dados
- **Escalabilidade:** Fácil adição de novos tipos de usuário
- **Manutenibilidade:** Lógica centralizada no App.tsx

## Próximas Implementações

1. **Autenticação Real:** Integração com Supabase
2. **Permissões Granulares:** Controle de acesso por funcionalidade
3. **Relatórios Avançados:** Mais gráficos para gestores
4. **Notificações:** Alertas específicos por tipo de usuário
5. **Configurações:** Personalização da interface por perfil 