// screens/OnboardingScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Button, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOnboardingCategories, supabase } from '../supabase';

export default function OnboardingScreen({ navigation }) {
    const [categories, setCategories] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                setLoading(true);
                const cats = await getOnboardingCategories();
                setCategories(cats);
            } catch (error) {
                console.error('Error loading categories:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchCategories();
    }, []);

    const toggleCategory = (category) => {
        if (selectedCategories.includes(category)) {
            setSelectedCategories(selectedCategories.filter(cat => cat !== category));
        } else {
            setSelectedCategories([...selectedCategories, category]);
        }
    };

    const completeOnboarding = async () => {
        try {
            const userId = await AsyncStorage.getItem('USER_ID');
            if (!userId) throw new Error('User ID not found');

            // Store selected categories in Supabase
            await supabase
                .from('users')
                .update({ onboarding_categories: selectedCategories })
                .eq('id', userId);

            // Store in AsyncStorage for offline access
            await AsyncStorage.setItem('USER_CATEGORIES', JSON.stringify(selectedCategories));
            await AsyncStorage.setItem('ONBOARDED', 'true');
            navigation.replace('Feed');
        } catch (error) {
            console.error('Error saving onboarding data:', error);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading categories...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Select Your Interests</Text>
            <Text style={styles.subtitle}>Choose at least one category to get started.</Text>
            <FlatList
                data={categories}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[
                            styles.categoryItem,
                            selectedCategories.includes(item) && styles.selectedCategory
                        ]}
                        onPress={() => toggleCategory(item)}
                    >
                        <Text style={[
                            styles.categoryText,
                            selectedCategories.includes(item) && styles.selectedCategoryText
                        ]}>
                            {item}
                        </Text>
                    </TouchableOpacity>
                )}
            />
            <Button
                title="Continue"
                onPress={completeOnboarding}
                disabled={selectedCategories.length === 0}
                color="#007AFF"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    loadingText: {
        fontSize: 16,
        color: '#666',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        marginBottom: 20,
        textAlign: 'center',
    },
    categoryItem: {
        padding: 15,
        marginVertical: 5,
        borderRadius: 10,
        backgroundColor: '#f0f0f0',
    },
    selectedCategory: {
        backgroundColor: '#007AFF',
    },
    categoryText: {
        fontSize: 16,
        color: '#000',
    },
    selectedCategoryText: {
        color: '#fff',
    },
});