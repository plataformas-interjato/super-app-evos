import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export interface CompressionResult {
  uri: string;
  base64?: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  width: number;
  height: number;
}

export interface CompressionConfig {
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  needsResize: boolean;
  format: ImageManipulator.SaveFormat;
}

class ImageCompressionService {
  
  /**
   * COMPRESSÃO INTELIGENTE SEM PERDA SIGNIFICATIVA DE QUALIDADE
   */
  async compressImage(
    imageUri: string, 
    photoType: 'inicial' | 'final' | 'coleta' | 'perfil'
  ): Promise<CompressionResult> {
    
    try {
      console.log(`📸 [COMPRESS] Iniciando compressão para tipo: ${photoType}`);
      
      // 1. Analisar tamanho original
      const originalInfo = await FileSystem.getInfoAsync(imageUri);
      const originalSize = originalInfo.exists ? (originalInfo as any).size || 0 : 0;
      const originalSizeMB = originalSize / (1024 * 1024);
      
      console.log(`📸 [COMPRESS] ${photoType}: ${originalSizeMB.toFixed(2)}MB original`);
      
      // 2. Obter configuração específica por tipo
      const config = this.getConfigByType(photoType, originalSizeMB);
      
      console.log(`📸 [COMPRESS] Config: quality=${config.quality}, resize=${config.needsResize}`);
      
      // 3. Aplicar compressão
      let actions: any[] = [];
      
      // Redimensionar se necessário (preserva aspect ratio)
      if (config.needsResize && config.maxWidth && config.maxHeight) {
        actions.push({
          resize: {
            width: config.maxWidth,
            height: config.maxHeight
          }
        });
      }
      
      // 4. Executar manipulação
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        actions,
        {
          compress: config.quality,
          format: config.format,
          base64: true
        }
      );
      
      // 5. Calcular estatísticas
      const compressedInfo = await FileSystem.getInfoAsync(result.uri);
      const compressedSize = compressedInfo.exists ? (compressedInfo as any).size || 0 : 0;
      const compressionRatio = originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0;
      
      console.log(`✅ [COMPRESS] ${photoType}: ${(compressedSize/(1024*1024)).toFixed(2)}MB final (${compressionRatio.toFixed(1)}% redução)`);
      
      return {
        uri: result.uri,
        base64: result.base64,
        originalSize,
        compressedSize,
        compressionRatio,
        width: result.width,
        height: result.height
      };
      
    } catch (error) {
      console.error('❌ [COMPRESS] Erro na compressão:', error);
      // Em caso de erro, retornar imagem original
      const originalInfo = await FileSystem.getInfoAsync(imageUri);
      const originalSize = originalInfo.exists ? (originalInfo as any).size || 0 : 0;
      
      // Converter para base64 se necessário
      let base64: string | undefined;
      try {
        const base64Data = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        base64 = `data:image/jpeg;base64,${base64Data}`;
      } catch (base64Error) {
        console.warn('⚠️ Erro ao converter para base64:', base64Error);
      }
      
      return {
        uri: imageUri,
        base64,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 0,
        width: 0,
        height: 0
      };
    }
  }
  
  /**
   * CONFIGURAÇÕES OTIMIZADAS POR TIPO DE FOTO
   */
  private getConfigByType(photoType: string, sizeMB: number): CompressionConfig {
    const configs: { [key: string]: CompressionConfig } = {
      inicial: {
        quality: sizeMB > 3 ? 0.7 : sizeMB > 1.5 ? 0.8 : 0.85,
        maxWidth: 1920,
        maxHeight: 1080,
        needsResize: sizeMB > 2,
        format: ImageManipulator.SaveFormat.JPEG
      },
      final: {
        quality: sizeMB > 3 ? 0.7 : sizeMB > 1.5 ? 0.8 : 0.85,
        maxWidth: 1920,
        maxHeight: 1080,
        needsResize: sizeMB > 2,
        format: ImageManipulator.SaveFormat.JPEG
      },
      coleta: {
        quality: sizeMB > 2 ? 0.75 : 0.8,
        maxWidth: 1600,
        maxHeight: 1200,
        needsResize: sizeMB > 1.5,
        format: ImageManipulator.SaveFormat.JPEG
      },
      perfil: {
        quality: 0.9,
        maxWidth: 512,
        maxHeight: 512,
        needsResize: true,
        format: ImageManipulator.SaveFormat.PNG
      }
    };
    
    return configs[photoType] || configs.coleta;
  }
  
  /**
   * ANÁLISE DE IMAGEM (SEM COMPRESSÃO)
   */
  async analyzeImage(imageUri: string): Promise<{
    size: number;
    sizeInMB: number;
    dimensions?: { width: number; height: number };
    recommendedReduction: number;
  }> {
    
    try {
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      const size = fileInfo.exists ? (fileInfo as any).size || 0 : 0;
      const sizeInMB = size / (1024 * 1024);
      
      // Estimativa de redução baseada no tamanho
      let recommendedReduction = 0;
      if (sizeInMB > 3) {
        recommendedReduction = 70;
      } else if (sizeInMB > 1.5) {
        recommendedReduction = 50;
      } else if (sizeInMB > 0.8) {
        recommendedReduction = 30;
      } else {
        recommendedReduction = 15;
      }
      
      return {
        size,
        sizeInMB: Number(sizeInMB.toFixed(2)),
        recommendedReduction
      };
      
    } catch (error) {
      console.error('❌ [ANALYZE] Erro na análise:', error);
      return {
        size: 0,
        sizeInMB: 0,
        recommendedReduction: 0
      };
    }
  }
}

const imageCompressionService = new ImageCompressionService();
export default imageCompressionService; 