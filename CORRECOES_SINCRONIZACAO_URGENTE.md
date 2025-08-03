# 🚨 CORREÇÕES URGENTES PARA SINCRONIZAÇÃO

## PROBLEMAS IDENTIFICADOS

### ❌ PROBLEMA 1: PhotoCollectionScreen usa AsyncStorage
**Arquivo:** `src/screens/PhotoCollectionScreen.tsx`
**Linhas:** 462-500, 574-613, 782-827, 895-940

**Problema:** Todas as fotos são salvas no AsyncStorage (`offline_dados_records`) mas o sistema unificado busca no FileSystem (`USER_ACTIONS`).

**Correção Necessária:**
```typescript
// SUBSTITUIR ESTE CÓDIGO (linhas 462-500):
console.log('💾 Salvando foto URI direto no AsyncStorage (SEM conversão base64)...');
const offlineKey = 'offline_dados_records';
const existingDataStr = await AsyncStorage.getItem(offlineKey);
// ... resto do código AsyncStorage

// POR ESTE CÓDIGO:
console.log('💾 Salvando foto no sistema unificado (FileSystem)...');
try {
  const { default: unifiedOfflineDataService } = await import('../services/unifiedOfflineDataService');
  
  const result = await unifiedOfflineDataService.saveDadosRecord(
    workOrder.id,
    user.id.toString(),
    entryId,
    photoUriToSave
  );
  
  if (result.success) {
    console.log('✅ Foto salva no sistema unificado');
    setCollectedPhotos(prev => ({ ...prev, [entryId]: photoUriToSave }));
    Alert.alert('Foto Coletada', result.savedOffline ? 'Salva localmente.' : 'Salva com sucesso!');
  } else {
    console.error('❌ Erro ao salvar:', result.error);
    Alert.alert('Erro', 'Não foi possível salvar a foto.');
  }
} catch (error) {
  console.error('❌ Erro no sistema unificado:', error);
  Alert.alert('Erro', 'Erro interno ao salvar foto.');
}
```

### ✅ PROBLEMA 2: Método faltante - CORRIGIDO
**Arquivo:** `src/services/unifiedOfflineDataService.ts`
**Status:** ✅ Adicionado método `saveServiceStepDataLocal`

### ❌ PROBLEMA 3: Migração de dados AsyncStorage
**Arquivo:** Criar `src/services/asyncStorageMigrationService.ts`

**Correção Necessária:**
```typescript
export const migrateAsyncStorageToUnified = async (): Promise<void> => {
  try {
    console.log('🔄 Migrando dados AsyncStorage → FileSystem...');
    
    // 1. Migrar offline_dados_records
    const offlineData = await AsyncStorage.getItem('offline_dados_records');
    if (offlineData) {
      const records = JSON.parse(offlineData);
      for (const [key, record] of Object.entries(records)) {
        if (!record.synced) {
          await unifiedOfflineDataService.saveDadosRecord(
            record.ordem_servico_id,
            'migrated',
            record.entrada_dados_id,
            record.valor
          );
        }
      }
      await AsyncStorage.removeItem('offline_dados_records');
    }
    
    // 2. Migrar offline_fotos_extras
    const extrasData = await AsyncStorage.getItem('offline_fotos_extras');
    if (extrasData) {
      const extras = JSON.parse(extrasData);
      for (const [key, extra] of Object.entries(extras)) {
        if (!extra.synced) {
          await unifiedOfflineDataService.saveDadosRecord(
            extra.ordem_servico_id,
            'migrated',
            extra.entrada_dados_id || 999999,
            extra.photoUri
          );
        }
      }
      await AsyncStorage.removeItem('offline_fotos_extras');
    }
    
    console.log('✅ Migração AsyncStorage → FileSystem concluída');
  } catch (error) {
    console.error('❌ Erro na migração:', error);
  }
};
```

### ❌ PROBLEMA 4: StartServiceScreen verificação
**Arquivo:** `src/screens/StartServiceScreen.tsx`
**Verificar:** Se usa `integratedOfflineService` ou `unifiedOfflineDataService`

## APLICAÇÃO DAS CORREÇÕES

### PASSO 1: Corrigir PhotoCollectionScreen
Substituir TODAS as ocorrências de AsyncStorage por unifiedOfflineDataService nas linhas:
- 462-500 (primeira função de foto)
- 574-613 (segunda função de foto)  
- 782-827 (foto extra)
- 895-940 (foto extra modal)

### PASSO 2: Criar serviço de migração
Criar `asyncStorageMigrationService.ts` e chamar no App.tsx

### PASSO 3: Verificar StartServiceScreen
Garantir que usa sistema unificado

### PASSO 4: Testar sincronização
1. Fazer OS offline com fotos
2. Conectar internet
3. Verificar logs de sincronização

## COMANDOS DE TESTE

```javascript
// No console do app após correções:
global.countPendingActions() // Deve mostrar ações pendentes
global.syncPendingActions() // Deve sincronizar dados
global.migrateAsyncStorage() // Migrar dados órfãos
``` 