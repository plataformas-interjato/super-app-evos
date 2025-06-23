# Guia de Build - App do Futuro

## Configuração Inicial

### 1. Instalação do EAS CLI
```bash
npm install -g eas-cli
```

### 2. Login no Expo
```bash
eas login
```

### 3. Configuração do Projeto
```bash
eas build:configure
```

## Tipos de Build

### APK (Para testes e distribuição direta)
```bash
# Build de preview (APK)
eas build --platform android --profile preview

# Build personalizado de APK
eas build --platform android --profile apk
```

### App Bundle (Para Google Play Store)
```bash
# Build de produção (AAB)
eas build --platform android --profile production
```

## Profiles Configurados

### `preview`
- Gera APK
- Distribuição interna
- Ideal para testes

### `apk`
- Gera APK
- Configuração customizada
- Para distribuição direta

### `production`
- Gera App Bundle (AAB)
- Auto-incremento de versão
- Para Google Play Store

## Comandos Úteis

### Verificar Status dos Builds
```bash
eas build:list --platform android
```

### Baixar Build
```bash
eas build:download [BUILD_ID]
```

### Cancelar Build
```bash
eas build:cancel [BUILD_ID]
```

### Ver Logs do Build
```bash
eas build:view [BUILD_ID]
```

## Estrutura do eas.json

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true,
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

## Configuração do app.config.js

```javascript
export default {
  expo: {
    // ... outras configurações
    extra: {
      eas: {
        projectId: "0855e7f0-a964-4eed-b3bd-4f3b2ba6f4a2"
      }
    }
  }
};
```

## Troubleshooting

### Build Falha
1. Verificar logs: `eas build:view [BUILD_ID]`
2. Verificar dependências: `npx expo-doctor`
3. Limpar cache: `npx expo start --clear`

### Erro de Configuração
1. Verificar `app.config.js`
2. Verificar `eas.json`
3. Re-configurar: `eas build:configure`

### Problemas de Login
```bash
eas logout
eas login
```

## Fluxo Completo de Build

1. **Desenvolvimento:**
   ```bash
   # Testar localmente
   npx expo start
   
   # Verificar problemas
   npx expo-doctor
   ```

2. **Build:**
   ```bash
   # Para APK de teste
   eas build --platform android --profile preview
   
   # Para produção
   eas build --platform android --profile production
   ```

3. **Distribuição:**
   ```bash
   # Download manual
   eas build:download
   
   # Ou submit para store
   eas submit --platform android
   ```

## Dicas

- **APK vs AAB:** Use APK para distribuição direta, AAB para Google Play
- **Preview builds:** Ideais para testes internos
- **Production builds:** Apenas para releases oficiais
- **Versioning:** Configurado para auto-incremento em produção

## Monitoramento

- Dashboard: https://expo.dev/accounts/dennerrobert/projects/app-do-futuro
- Builds podem levar 10-20 minutos
- Notificações por email quando concluído 