import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SearchBar from './SearchBar';

interface AuditSearchSectionProps {
  searchValue: string;
  onSearchChange: (text: string) => void;
}

const AuditSearchSection: React.FC<AuditSearchSectionProps> = ({ 
  searchValue, 
  onSearchChange 
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pesquisar auditorias</Text>
      <SearchBar
        value={searchValue}
        onChangeText={onSearchChange}
        placeholder="Buscar por ID"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginHorizontal: 20,
    marginBottom: 5,
  },
});

export default AuditSearchSection; 