import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import ProfileHeader from '../components/ProfileHeader';
import StatsCard from '../components/StatsCard';
import AuditSearchSection from '../components/AuditSearchSection';
import AuditCard from '../components/AuditCard';
import BottomNavigation from '../components/BottomNavigation';

import { User } from '../types/workOrder';
import { UserStats, Audit } from '../types/profile';

interface ProfileScreenProps {
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ 
  user, 
  onBackPress, 
  onTabPress 
}) => {
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [userStats, setUserStats] = useState<UserStats>({
    totalWorkOrders: 0,
    ranking: 4.8,
    completionRate: 95,
  });

  // Dados de exemplo - em produção, viriam de uma API
  const mockAudits: Audit[] = [
    {
      id: '1',
      supabaseId: 'supabase_01',
      title: 'Auditoria de Segurança',
      status: 'concluida',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      supabaseId: 'supabase_02',
      title: 'Auditoria de Qualidade',
      status: 'em_andamento',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      supabaseId: 'supabase_03',
      title: 'Auditoria Ambiental',
      status: 'pendente',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '4',
      supabaseId: 'supabase_04',
      title: 'Auditoria Financeira',
      status: 'cancelada',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  useEffect(() => {
    loadAudits();
    loadUserStats();
  }, []);

  const loadAudits = () => {
    // Em produção, buscar dados da API
    setAudits(mockAudits);
  };

  const loadUserStats = () => {
    // Em produção, buscar estatísticas da API
    setUserStats({
      totalWorkOrders: 42,
      ranking: 4.8,
      completionRate: 95,
    });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      loadAudits();
      loadUserStats();
      setRefreshing(false);
    }, 1500);
  };

  const handleAuditPress = (audit: Audit) => {
    Alert.alert(
      'Auditoria',
      `Abrir auditoria #${audit.supabaseId} - ${audit.title}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir', onPress: () => console.log('Abrir auditoria:', audit.id) },
      ]
    );
  };

  const handleTabNavigation = (tab: 'home' | 'profile') => {
    onTabPress(tab);
  };

  const filteredAudits = audits.filter((audit) => {
    return audit.supabaseId.toLowerCase().includes(searchText.toLowerCase()) ||
           audit.title.toLowerCase().includes(searchText.toLowerCase()) ||
           audit.id.includes(searchText);
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <ProfileHeader user={user} onBackPress={onBackPress} />
      
      {/* ScrollView principal da tela */}
      <ScrollView
        style={styles.mainScrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <StatsCard stats={userStats} />
        
        <AuditSearchSection
          searchValue={searchText}
          onSearchChange={setSearchText}
        />
        
        {/* Lista de Auditorias */}
        <View style={styles.auditsContainer}>
          {filteredAudits.map((audit) => (
            <AuditCard
              key={audit.id}
              audit={audit}
              onPress={() => handleAuditPress(audit)}
            />
          ))}
        </View>
        
        {/* Espaço extra no final para evitar que o último item fique atrás da navegação */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
      
      <BottomNavigation
        activeTab="profile"
        onTabPress={handleTabNavigation}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  mainScrollContainer: {
    flex: 1,
  },
  auditsContainer: {
    paddingBottom: 10,
  },
  bottomSpacer: {
    height: 100,
  },
});

export default ProfileScreen; 