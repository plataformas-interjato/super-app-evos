import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { RFValue } from 'react-native-responsive-fontsize';
import { FilterStatus } from '../types/workOrder';

interface FilterTabsProps {
  activeFilter: FilterStatus;
  onFilterChange: (filter: FilterStatus) => void;
}

const FilterTabs: React.FC<FilterTabsProps> = ({ activeFilter, onFilterChange }) => {
  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'todas', label: 'TODAS' },
    { key: 'aguardando', label: 'AGUARDANDO' },
    { key: 'em_progresso', label: 'EM PROGRESSO' },
    { key: 'finalizada', label: 'FINALIZADA' },
    { key: 'cancelada', label: 'CANCELADA' },
    { key: 'atrasada', label: 'ATRASADA' },
  ];

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scrollView}
    >
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter.key}
          style={[
            styles.tab,
            activeFilter === filter.key && styles.activeTab,
          ]}
          onPress={() => onFilterChange(filter.key)}
        >
          <Text
            style={[
              styles.tabText,
              activeFilter === filter.key && styles.activeTabText,
            ]}
          >
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    maxHeight: 60,
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
    height: 40,
  },
  tab: {
    height: 40,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: '#e5e7eb',
    marginRight: 10,
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: RFValue(14),
    fontWeight: 'bold',
    color: '#6b7280',
    textAlign: 'center',
  },
  activeTabText: {
    color: 'white',
  },
});

export default FilterTabs; 