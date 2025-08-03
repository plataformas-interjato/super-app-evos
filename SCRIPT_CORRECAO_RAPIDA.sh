#!/bin/bash

# 🚨 SCRIPT DE CORREÇÃO URGENTE PARA PHOTOCOLLECTIONSCREEN
# Este script corrige todas as funções que ainda usam AsyncStorage

echo "🔧 Iniciando correção do PhotoCollectionScreen..."

# Fazer backup do arquivo original
cp src/screens/PhotoCollectionScreen.tsx src/screens/PhotoCollectionScreen.tsx.backup

# CORREÇÃO 1: Remover blocos AsyncStorage restantes da takePhoto
sed -i '/\/\/ 2\. Criar ação no offline_actions APENAS COM URI/,/await AsyncStorage\.setItem(actionKey, JSON\.stringify(existingActions));/d' src/screens/PhotoCollectionScreen.tsx

# CORREÇÃO 2: Remover blocos AsyncStorage da takePhotoFromModal  
sed -i '/\/\/ 2\. Criar ação no offline_actions APENAS COM URI/,/console\.log.*Foto será convertida para base64 apenas durante sincronização/d' src/screens/PhotoCollectionScreen.tsx

# CORREÇÃO 3: Substituir takeExtraPhoto AsyncStorage
sed -i '/console\.log.*Salvando foto extra URI direto no AsyncStorage/,/console\.log.*Foto será convertida para base64 apenas durante sincronização/c\
        console.log("💾 Salvando foto extra no sistema unificado (FileSystem)...");\
        \
        try {\
          const { default: unifiedOfflineDataService } = await import("../services/unifiedOfflineDataService");\
          \
          const result = await unifiedOfflineDataService.saveDadosRecord(\
            workOrder.id,\
            user.id.toString(),\
            extraEntry.stepId, // Usar stepId como entradaDadosId\
            photoUri\
          );\
          \
          if (result.success) {\
            console.log("✅ Foto extra salva no sistema unificado");\
            \
            setExtraPhotoEntries(prev => ({\
              ...prev,\
              [extraEntry.stepId]: prev[extraEntry.stepId].map(entry => \
                entry.id === extraEntry.id ? { ...entry, photoUri: photoUri } : entry\
              )\
            }));\
          } else {\
            console.error("❌ Erro ao salvar foto extra:", result.error);\
            Alert.alert("Erro", "Não foi possível salvar a foto extra.");\
          }\
        } catch (unifiedError) {\
          console.error("❌ Erro no sistema unificado:", unifiedError);\
          Alert.alert("Erro", "Erro interno ao salvar foto extra.");\
        }' src/screens/PhotoCollectionScreen.tsx

# CORREÇÃO 4: Substituir takeExtraPhotoFromModal AsyncStorage
sed -i '/console\.log.*Salvando foto extra via modal URI direto no AsyncStorage/,/console\.log.*Foto será convertida para base64 apenas durante sincronização/c\
        console.log("💾 Salvando foto extra via modal no sistema unificado (FileSystem)...");\
        \
        try {\
          const { default: unifiedOfflineDataService } = await import("../services/unifiedOfflineDataService");\
          \
          const result = await unifiedOfflineDataService.saveDadosRecord(\
            workOrder.id,\
            user.id.toString(),\
            selectedExtraEntry.stepId,\
            photoUri\
          );\
          \
          if (result.success) {\
            console.log("✅ Foto extra via modal salva no sistema unificado");\
            \
            setExtraPhotoEntries(prev => ({\
              ...prev,\
              [selectedExtraEntry.stepId]: prev[selectedExtraEntry.stepId].map(entry => \
                entry.id === selectedExtraEntry.id ? { ...entry, photoUri: photoUri } : entry\
              )\
            }));\
          } else {\
            console.error("❌ Erro ao salvar foto extra via modal:", result.error);\
            Alert.alert("Erro", "Não foi possível salvar a foto extra.");\
          }\
        } catch (unifiedError) {\
          console.error("❌ Erro no sistema unificado:", unifiedError);\
          Alert.alert("Erro", "Erro interno ao salvar foto extra.");\
        }' src/screens/PhotoCollectionScreen.tsx

echo "✅ Correções aplicadas com sucesso!"
echo "📋 Backup salvo em: src/screens/PhotoCollectionScreen.tsx.backup"
echo "🧪 Execute os testes de validação conforme CORRECAO_PHOTO_COLLECTION_COMPLETA.md" 