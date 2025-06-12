# Componentes da Aplicação

Esta pasta contém todos os componentes reutilizáveis da aplicação, seguindo as melhores práticas de desenvolvimento React Native.

## Estrutura dos Componentes

### Componentes da Tela Principal

### Header.tsx
**Descrição:** Componente de cabeçalho que exibe informações do usuário e status de conexão.

**Props:**
- `user: User` - Dados do usuário logado
- `isConnected: boolean` - Status da conexão

**Características:**
- Gradiente azul seguindo o design do app
- Exibe nome e função do usuário
- Indica status de conexão (online/offline)
- Mostra data atual
- Ícones intuitivos usando Ionicons

### SearchBar.tsx
**Descrição:** Barra de pesquisa para filtrar ordens de serviço.

**Props:**
- `value: string` - Texto atual da busca
- `onChangeText: (text: string) => void` - Callback para mudanças no texto
- `placeholder?: string` - Texto placeholder (padrão: "Buscar OS")

**Características:**
- Design arredondado com shadow
- Ícone de busca integrado
- Responsivo e acessível

### FilterTabs.tsx
**Descrição:** Abas de filtro horizontais para categorizar ordens de serviço.

**Props:**
- `activeFilter: FilterStatus` - Filtro ativo atual
- `onFilterChange: (filter: FilterStatus) => void` - Callback para mudança de filtro

**Características:**
- Scroll horizontal para múltiplas opções
- Estado visual ativo/inativo
- Seis filtros: TODAS, AGUARDANDO, EM PROGRESSO, FINALIZADA, CANCELADA, ATRASADA

### WorkOrderCard.tsx
**Descrição:** Card individual para exibir dados de uma ordem de serviço.

**Props:**
- `workOrder: WorkOrder` - Dados da ordem de serviço
- `onPress?: () => void` - Callback para clique no card
- `onRefresh?: () => void` - Callback para atualizar a OS

**Características:**
- Layout organizado com ícones descritivos
- Badge de prioridade colorido (alta=vermelho, média=amarelo, baixa=verde)
- Botão de refresh integrado
- Shadow e bordas arredondadas

### BottomNavigation.tsx
**Descrição:** Navegação inferior com duas abas principais.

**Props:**
- `activeTab: 'home' | 'profile'` - Aba ativa atual
- `onTabPress: (tab: 'home' | 'profile') => void` - Callback para mudança de aba

**Características:**
- Ícones dinâmicos (filled/outline)
- Cores que seguem o design system
- Acessibilidade e feedback visual

## Componentes da Tela de Perfil

### ProfileHeader.tsx
**Descrição:** Cabeçalho da tela de perfil com avatar e informações do usuário.

**Props:**
- `user: User` - Dados do usuário
- `onBackPress: () => void` - Callback para botão voltar

**Características:**
- Gradiente azul com botão de voltar
- Avatar centralizado com bordas
- Nome e função do usuário
- Layout responsivo

### StatsCard.tsx
**Descrição:** Card de estatísticas do usuário.

**Props:**
- `stats: UserStats` - Estatísticas do usuário

**Características:**
- Layout dividido (OS realizadas / Ranqueamento)
- Estrela dourada para ranking
- Divisor visual entre seções
- Design clean e minimalista

### AuditSearchSection.tsx
**Descrição:** Seção de pesquisa de auditorias.

**Props:**
- `searchValue: string` - Valor atual da busca
- `onSearchChange: (text: string) => void` - Callback para mudanças

**Características:**
- Título "Pesquisar auditorias"
- Reutiliza SearchBar com placeholder customizado
- Layout consistente com resto da app

### AuditCard.tsx
**Descrição:** Card para exibir informações de auditoria.

**Props:**
- `audit: Audit` - Dados da auditoria
- `onPress?: () => void` - Callback para clique

**Características:**
- Background azul claro (#38bdf8)
- ID do Supabase prominente
- Badge de status colorido
- Título da auditoria
- Estados: Concluída, Em Andamento, Pendente, Cancelada

## Padrões Utilizados

### Estrutura de Arquivos
- Cada componente em seu próprio arquivo
- Interfaces TypeScript bem definidas
- Estilos usando StyleSheet do React Native
- Exportação via index.ts para facilitar imports

### Design System
- **Cores Primárias:** Azul (#3b82f6, #1e3a8a)
- **Cores de Estado:** Verde (#10b981), Amarelo (#f59e0b), Vermelho (#ef4444)
- **Cinzas:** (#374151, #6b7280, #9ca3af, #e5e7eb, #f3f4f6)
- **Azul Claro:** (#38bdf8) para cards de auditoria
- **Tipografia:** Pesos 400, 500, 600, 700
- **Espaçamentos:** Múltiplos de 4 (8, 12, 16, 20, 24px)
- **Bordas:** Radius de 12-25px para suavidade

### Responsividade
- Flexbox para layouts adaptativos
- ScrollViews horizontais quando necessário
- Shadows e elevations para hierarquia visual
- Padding/margin consistentes

### Acessibilidade
- Props de acessibilidade quando relevante
- Cores contrastantes
- Tamanhos de toque adequados (44px mínimo)
- Feedback visual para interações

## Como Usar

```typescript
import { 
  Header, 
  SearchBar, 
  WorkOrderCard,
  ProfileHeader,
  StatsCard,
  AuditCard 
} from '../components';

// Exemplo de uso - Tela Principal
<Header user={currentUser} isConnected={networkStatus} />
<SearchBar value={searchTerm} onChangeText={setSearchTerm} />
<WorkOrderCard 
  workOrder={order} 
  onPress={() => navigateToDetails(order.id)}
  onRefresh={() => refreshOrder(order.id)}
/>

// Exemplo de uso - Tela de Perfil
<ProfileHeader user={currentUser} onBackPress={goBack} />
<StatsCard stats={userStatistics} />
<AuditCard 
  audit={auditData} 
  onPress={() => openAudit(auditData.id)}
/>
```

## Melhorias Futuras

1. **Animações:** Adicionar transições suaves entre estados
2. **Temas:** Suporte a modo escuro/claro
3. **Internacionalização:** Suporte a múltiplos idiomas
4. **Performance:** Memoização com React.memo para componentes pesados
5. **Testes:** Adicionar testes unitários com Jest/Testing Library
6. **Navegação:** Implementar navegação com React Navigation
7. **Cache:** Implementar cache de dados com AsyncStorage 