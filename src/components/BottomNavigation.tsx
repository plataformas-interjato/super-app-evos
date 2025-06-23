import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';

interface BottomNavigationProps {
  activeTab: 'home' | 'profile';
  onTabPress: (tab: 'home' | 'profile') => void;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ 
  activeTab, 
  onTabPress 
}) => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.solidContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'home' && styles.activeTab]}
          onPress={() => onTabPress('home')}
        >
          <Ionicons
            name={activeTab === 'home' ? 'home' : 'home-outline'}
            size={22}
            color={activeTab === 'home' ? '#3b82f6' : '#9ca3af'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'home' && styles.activeTabText,
            ]}
          >
            Início
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'profile' && styles.activeTab]}
          onPress={() => onTabPress('profile')}
        >
          <Ionicons
            name={activeTab === 'profile' ? 'person' : 'person-outline'}
            size={22}
            color={activeTab === 'profile' ? '#3b82f6' : '#9ca3af'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'profile' && styles.activeTabText,
            ]}
          >
            Perfil
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#ffffff',
  },
  solidContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  activeTab: {
    // Pode adicionar estilos para o tab ativo se necessário
  },
  tabText: {
    fontSize: RFValue(11),
    color: '#9ca3af',
    marginTop: 2,
  },
  activeTabText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});

export default BottomNavigation; 