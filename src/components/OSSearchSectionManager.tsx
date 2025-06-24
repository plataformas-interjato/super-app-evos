import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';

interface OSSearchSectionManagerProps {
  searchValue: string;
  onSearchChange: (text: string) => void;
  searchDate: string;
  onSearchDateChange: (date: string) => void;
  searchTechnician: string;
  onSearchTechnicianChange: (technician: string) => void;
  showAdvancedSearch: boolean;
  onToggleAdvancedSearch: (show: boolean) => void;
  onSearch: () => void;
  isSearching: boolean;
  onDatePickerPress?: () => void;
}

const OSSearchSectionManager: React.FC<OSSearchSectionManagerProps> = ({ 
  searchValue,
  onSearchChange,
  searchDate,
  onSearchDateChange,
  searchTechnician,
  onSearchTechnicianChange,
  showAdvancedSearch,
  onToggleAdvancedSearch,
  onSearch,
  isSearching,
  onDatePickerPress
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.searchHeader}>
        <Text style={styles.sectionTitle}>Pesquisar ordens de serviço</Text>
      </View>
      
      {/* Campo de busca principal */}
      <View style={styles.searchInputContainer}>
        <Ionicons name="search" size={20} color="#6b7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchValue}
          onChangeText={onSearchChange}
          placeholder="ID ou título da OS"
          placeholderTextColor="#9ca3af"
        />
      </View>
      
      {/* Botão Busca Avançada */}
      <TouchableOpacity 
        style={styles.advancedSearchButton} 
        onPress={() => onToggleAdvancedSearch(!showAdvancedSearch)}
      >
        <Ionicons 
          name={showAdvancedSearch ? "chevron-up" : "chevron-down"} 
          size={16} 
          color="#3b82f6" 
        />
        <Text style={styles.advancedSearchText}>Busca Avançada</Text>
      </TouchableOpacity>
      
      {/* Seção de busca avançada */}
      {showAdvancedSearch && (
        <View style={styles.advancedSearchContainer}>
          {/* Campo de data */}
          <View style={styles.advancedRow}>
            <Text style={styles.fieldLabel}>Data:</Text>
            <View style={styles.dateInputContainer}>
              <TextInput
                style={styles.dateInput}
                value={searchDate}
                onChangeText={onSearchDateChange}
                placeholder="dd/mm/yy"
                placeholderTextColor="#9ca3af"
                maxLength={8}
              />
              <TouchableOpacity onPress={onDatePickerPress}>
                <Ionicons name="calendar-outline" size={20} color="#6b7280" style={styles.calendarIcon} />
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Campo de técnico */}
          <View style={styles.advancedRow}>
            <Text style={styles.fieldLabel}>Técnico:</Text>
            <View style={styles.technicianInputContainer}>
              <Ionicons name="person-outline" size={20} color="#6b7280" style={styles.technicianIcon} />
              <TextInput
                style={styles.technicianInput}
                value={searchTechnician}
                onChangeText={onSearchTechnicianChange}
                placeholder="Nome do técnico"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          
          <TouchableOpacity 
            style={[styles.searchButton, isSearching && styles.searchButtonDisabled]} 
            onPress={onSearch}
            disabled={isSearching}
          >
            <Text style={styles.searchButtonText}>
              {isSearching ? 'Pesquisando...' : 'Pesquisar'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Botão de pesquisa simples quando busca avançada está fechada */}
      {!showAdvancedSearch && (
        <TouchableOpacity 
          style={[styles.searchButton, isSearching && styles.searchButtonDisabled]} 
          onPress={onSearch}
          disabled={isSearching}
        >
          <Text style={styles.searchButtonText}>
            {isSearching ? 'Pesquisando...' : 'Pesquisar'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 0,
    shadowColor: 'transparent',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  searchHeader: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: '#374151',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: RFValue(16),
    color: '#374151',
  },
  advancedSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  advancedSearchText: {
    fontSize: RFValue(14),
    color: '#3b82f6',
    marginLeft: 5,
    fontWeight: '500',
  },
  advancedSearchContainer: {
    marginTop: 10,
  },
  advancedRow: {
    marginBottom: 15,
  },
  fieldLabel: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dateInput: {
    flex: 1,
    fontSize: RFValue(16),
    color: '#374151',
  },
  calendarIcon: {
    marginLeft: 10,
  },
  technicianInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  technicianIcon: {
    marginRight: 10,
  },
  technicianInput: {
    flex: 1,
    fontSize: RFValue(16),
    color: '#374151',
  },
  searchButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  searchButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  searchButtonText: {
    color: 'white',
    fontSize: RFValue(16),
    fontWeight: '600',
  },
});

export default OSSearchSectionManager; 