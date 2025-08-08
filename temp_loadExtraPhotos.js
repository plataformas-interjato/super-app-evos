// NOVA FUNCIONALIDADE: Carregar fotos extras salvas do sistema unificado FileSystem
const loadExtraPhotos = async () => {
  try {
    const { default: unifiedOfflineDataService } = await import("../services/unifiedOfflineDataService");
    
    // Buscar dados extras do sistema unificado FileSystem
    const extrasData = await unifiedOfflineDataService.getExtraPhotosData(workOrder.id, user.id.toString());
    const loadedExtraEntries: { [stepId: number]: ExtraPhotoEntry[] } = {};
    
    if (extrasData && extrasData.length > 0) {
      // Agrupar por etapa_id
      extrasData.forEach((record: any, index: number) => {
        if (record.valor) {
          const stepId = record.etapa_id;
          
          if (!loadedExtraEntries[stepId]) {
            loadedExtraEntries[stepId] = [];
          }
          
          loadedExtraEntries[stepId].push({
            id: `extra_${stepId}_${index}`,
            titulo: record.titulo || `Foto Extra ${loadedExtraEntries[stepId].length + 1}`,
            stepId: stepId,
            photoUri: record.valor,
            created_at: record.created_at || new Date().toISOString()
          });
        }
      });
      
      // Ordenar por data de criação
      Object.keys(loadedExtraEntries).forEach(stepId => {
        loadedExtraEntries[parseInt(stepId)].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
    }
    
    setExtraPhotoEntries(loadedExtraEntries);
    
    const totalExtras = Object.values(loadedExtraEntries).reduce((sum, entries) => sum + entries.length, 0);
    console.log(`📸 ${totalExtras} fotos extras carregadas do sistema unificado FileSystem`);
  } catch (error) {
    console.warn('⚠️ Erro ao carregar fotos extras do sistema unificado:', error);
    setExtraPhotoEntries({});
  }
};
