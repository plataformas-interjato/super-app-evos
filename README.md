# App do Futuro - EVOS

Este é um app React Native com Expo e TypeScript que inclui uma tela de login com o design da EVOS.

## 🚀 Como executar

### Pré-requisitos
- Node.js (versão 18 ou superior)
- npm ou yarn
- Expo CLI (`npm install -g @expo/cli`)
- Expo Go app no seu celular

### Executando o app

1. Instale as dependências (se ainda não fez):
```bash
npm install
```

2. Inicie o servidor de desenvolvimento:
```bash
npm start
```

3. Escaneie o QR code com:
   - **Android**: App Expo Go
   - **iOS**: Câmera do iPhone

## 📱 Funcionalidades Implementadas

- ✅ **Tela de login** com design fiel à EVOS
- ✅ **Interface responsiva** e moderna
- ✅ **Validação de formulários**
- ✅ **Estados de loading**
- ✅ **Navegação entre telas**
- ✅ **TypeScript** para tipagem
- ✅ **Componentes reutilizáveis**

## 🎨 Design

O design segue exatamente o padrão mostrado na referência:
- **Header azul** com gradiente
- **Logo EVOS** com "Container-box" em vermelho
- **Campos de formulário** com bordas arredondadas e sombras
- **Botão verde** para login
- **Interface moderna** e clean

## 🛠️ Tecnologias Utilizadas

- **React Native** - Framework mobile
- **Expo** - Plataforma de desenvolvimento
- **TypeScript** - Tipagem estática
- **Linear Gradient** - Gradientes
- **Vector Icons** - Ícones

## 📁 Estrutura do Projeto

```
src/
├── screens/
│   ├── LoginScreen.tsx    # Tela de login principal
│   └── HomeScreen.tsx     # Tela após login
└── types/
    └── auth.ts           # Tipos TypeScript
```

## 🔐 Próximos Passos (Integração com Supabase)

Para integrar com Supabase:

1. **Instale as dependências do Supabase**:
```bash
npm install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill react-native-get-random-values
```

2. **Configure o Supabase**:
   - Crie uma conta em [supabase.com](https://supabase.com)
   - Crie um novo projeto
   - Configure as credenciais em `src/services/supabase.ts`

3. **Restaure o contexto de autenticação**:
   - Use os arquivos em `src/contexts/AuthContext.tsx`
   - Atualize o `App.tsx` para usar o AuthProvider

## 📱 Como testar

1. Execute `npm start`
2. Escaneie o QR code com o Expo Go
3. Digite qualquer email e senha
4. Clique em "Entrar"
5. Você será redirecionado para a tela de boas-vindas

## 🎯 Status

✅ **Funcionando perfeitamente** no mobile (Android/iOS)
⚠️ Web requer configuração adicional do react-native-web
🔄 Supabase removido temporariamente para demonstração 