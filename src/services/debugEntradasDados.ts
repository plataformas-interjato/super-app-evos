import { getServiceStepsWithDataCached } from './serviceStepsService';
import { getCachedTableData } from './initialDataService';
import localDataService from './localDataService';

/**
 * Função de debug para testar se as entradas de dados estão sendo carregadas
 */
export const debugEntradasDados = async () => {
  console.log('🔍 === DEBUG ENTRADAS DE DADOS ===');
  
  try {
    // 1. Testar cache inicial
    console.log('📋 1. Testando cache inicial...');
    const cachedEtapas = await getCachedTableData('ETAPAS_OS');
    const cachedEntradas = await getCachedTableData('ENTRADAS_DADOS');
    
    console.log(`   - Etapas no cache: ${cachedEtapas.length}`);
    console.log(`   - Entradas no cache: ${cachedEntradas.length}`);
    
    if (cachedEtapas.length > 0) {
      console.log('   - Primeira etapa:', cachedEtapas[0]);
    }
    
    if (cachedEntradas.length > 0) {
      console.log('   - Primeira entrada:', cachedEntradas[0]);
    }
    
    // 2. Testar função getServiceStepsWithDataCached
    console.log('📋 2. Testando getServiceStepsWithDataCached...');
    const tipoOsId = 1; // Testar com tipo 1
    const workOrderId = 1; // Testar com OS 1
    
    const result = await getServiceStepsWithDataCached(tipoOsId, workOrderId);
    
    console.log(`   - Resultado: ${result.data ? 'SUCESSO' : 'FALHA'}`);
    console.log(`   - Erro: ${result.error || 'Nenhum'}`);
    console.log(`   - Do cache: ${result.fromCache ? 'SIM' : 'NÃO'}`);
    
    if (result.data) {
      console.log(`   - Total de etapas: ${result.data.length}`);
      result.data.forEach((step, index) => {
        console.log(`   - Etapa ${index + 1}: ${step.titulo} (${step.entradas?.length || 0} entradas)`);
        if (step.entradas && step.entradas.length > 0) {
          step.entradas.forEach((entrada, entryIndex) => {
            console.log(`     - Entrada ${entryIndex + 1}: ${entrada.titulo || entrada.valor || 'Sem título'}`);
          });
        }
      });
    }
    
    // 3. Testar dados locais
    console.log('📋 3. Testando dados locais...');
    const localStats = await localDataService.getLocalDataStats();
    console.log(`   - Total de dados locais: ${localStats.totalLocalData}`);
    console.log(`   - Dados por tipo:`, localStats.dataByType);
    console.log(`   - Não sincronizados: ${localStats.unsyncedCount}`);
    
    // 4. Testar combinação de dados
    console.log('📋 4. Testando combinação de dados...');
    if (result.data && result.data.length > 0) {
      const etapaIds = result.data.map(step => step.id);
      const combinedData = await localDataService.getServiceStepDataCombined(workOrderId, etapaIds);
      
      console.log(`   - Dados combinados para ${Object.keys(combinedData).length} etapas`);
      Object.keys(combinedData).forEach(etapaId => {
        const entries = combinedData[parseInt(etapaId)];
        console.log(`     - Etapa ${etapaId}: ${entries.length} entradas`);
      });
    }
    
  } catch (error) {
    console.error('💥 Erro no debug:', error);
  }
  
  console.log('🔍 === FIM DO DEBUG ===');
};

// Exportar para uso no console
(global as any).debugEntradasDados = debugEntradasDados; 