import securePhotoStorage from './securePhotoStorageService';
import photoMigrationAdapter from './photoMigrationAdapter';
import { getPhotoSystemDiagnostics, syncOfflinePhotos, cleanupOldPhotos } from './integratedOfflineService';

/**
 * INICIALIZAÇÃO E TESTE DO SISTEMA SEGURO DE FOTOS
 * 
 * Este arquivo permite testar e inicializar o novo sistema
 */

export const initializePhotoSystem = async (): Promise<{
  success: boolean;
  message: string;
  diagnostics?: any;
}> => {
  
  try {
    console.log('🚀 Inicializando sistema seguro de fotos...');
    
    // 1. Inicializar o armazenamento seguro
    await securePhotoStorage.initialize();
    console.log('✅ SecurePhotoStorage inicializado');
    
    // 2. Executar diagnóstico inicial
    const diagnostics = await getPhotoSystemDiagnostics();
    console.log('📊 Diagnóstico inicial:', diagnostics);
    
    // 3. Migrar algumas fotos legadas se existirem
    console.log('🔄 Verificando migração de fotos legadas...');
    const migrationResult = await photoMigrationAdapter.migrateBatchPhotos(5);
    
    if (migrationResult.migrated > 0) {
      console.log(`✅ ${migrationResult.migrated} fotos migradas`);
    } else {
      console.log('ℹ️ Nenhuma foto legada para migrar');
    }
    
    // 4. Executar limpeza se necessário
    if (diagnostics.secure.totalPhotos > 100) {
      console.log('🧹 Executando limpeza de fotos antigas...');
      const cleaned = await cleanupOldPhotos(30);
      console.log(`🧹 ${cleaned} fotos antigas removidas`);
    }
    
    console.log('🎉 Sistema de fotos inicializado com sucesso!');
    
    return {
      success: true,
      message: 'Sistema inicializado com sucesso',
      diagnostics
    };
    
  } catch (error) {
    console.error('❌ Erro na inicialização do sistema de fotos:', error);
    return {
      success: false,
      message: `Erro na inicialização: ${error.message}`
    };
  }
};

/**
 * TESTE COMPLETO DO SISTEMA
 */
export const testPhotoSystem = async (): Promise<{
  success: boolean;
  results: any;
}> => {
  
  try {
    console.log('🧪 Iniciando teste completo do sistema de fotos...');
    
    const results = {
      initialization: null as any,
      diagnostics: null as any,
      migrationStatus: null as any,
      syncTest: null as any
    };
    
    // 1. Teste de inicialização
    console.log('1️⃣ Testando inicialização...');
    results.initialization = await initializePhotoSystem();
    
    // 2. Diagnóstico detalhado
    console.log('2️⃣ Executando diagnóstico detalhado...');
    results.diagnostics = await getPhotoSystemDiagnostics();
    
    // 3. Status da migração
    console.log('3️⃣ Verificando status da migração...');
    results.migrationStatus = await photoMigrationAdapter.getMigrationStatus();
    
    // 4. Teste de sincronização
    console.log('4️⃣ Testando sincronização...');
    results.syncTest = await syncOfflinePhotos();
    
    console.log('✅ Teste completo finalizado');
    console.log('📊 Resultados:', results);
    
    return {
      success: true,
      results
    };
    
  } catch (error) {
    console.error('❌ Erro no teste do sistema:', error);
    return {
      success: false,
      results: { error: error.message }
    };
  }
};

/**
 * DEMONSTRAÇÃO DE USO
 */
export const demonstratePhotoSystem = async (): Promise<void> => {
  console.log('\n🎯 =================================');
  console.log('🎯 DEMONSTRAÇÃO DO SISTEMA SEGURO');
  console.log('🎯 =================================\n');
  
  // Informações do sistema
  console.log('📱 LOCAL SEGURO CONFIGURADO:');
  console.log('   iOS: Library/Application Support/AppPhotos/');
  console.log('   Android: documentDirectory/AppPhotos/');
  console.log('   + Backup automático em cacheDirectory\n');
  
  // Como usar
  console.log('🔧 COMO USAR (API COMPATÍVEL):');
  console.log('   // ANTES');
  console.log('   import { savePhotoInicioOffline } from "./offlineService";');
  console.log('   ');
  console.log('   // DEPOIS (mesma API!)');
  console.log('   import { savePhotoInicioOffline } from "./integratedOfflineService";');
  console.log('   ');
  console.log('   // Chamada idêntica:');
  console.log('   const result = await savePhotoInicioOffline(workOrderId, technicoId, photoUri);');
  console.log('   if (result.success) console.log("Foto salva:", result.photoId);\n');
  
  // Novas funcionalidades
  console.log('✨ NOVAS FUNCIONALIDADES:');
  console.log('   - Persistência garantida após restart');
  console.log('   - Backup automático de fotos');
  console.log('   - Diagnóstico completo do sistema');
  console.log('   - Migração automática em background');
  console.log('   - Limpeza inteligente de fotos antigas\n');
  
  // Comandos de teste
  console.log('🧪 COMANDOS DE TESTE (console do app):');
  console.log('   // Diagnóstico completo');
  console.log('   await getPhotoSystemDiagnostics()');
  console.log('   ');
  console.log('   // Migrar fotos legadas');
  console.log('   await photoMigrationAdapter.migrateBatchPhotos(10)');
  console.log('   ');
  console.log('   // Limpeza de fotos antigas');
  console.log('   await cleanupOldPhotos(30)');
  console.log('   ');
  console.log('   // Status detalhado');
  console.log('   await securePhotoStorage.getDiagnostics()');
  console.log('\n🎯 =================================\n');
};

// Disponibilizar no console global para testes
if (typeof global !== 'undefined') {
  (global as any).initPhotoSystem = initializePhotoSystem;
  (global as any).testPhotoSystem = testPhotoSystem;
  (global as any).demonstratePhotoSystem = demonstratePhotoSystem;
  (global as any).getPhotoSystemDiagnostics = getPhotoSystemDiagnostics;
} 