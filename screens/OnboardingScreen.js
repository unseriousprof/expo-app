// screens/OnboardingScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Button, StyleSheet, Dimensions, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOnboardingCategories, supabase } from '../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import { useColorScheme } from '../hooks/useColorScheme';

export default function OnboardingScreen({ navigation }) {
    const [categories, setCategories] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme || 'light'];
    // For button animation
    const buttonScale = React.useRef(new Animated.Value(1)).current;

    // Emoji map for categories (add more as desired)
    const emojiMap = {
        'Physics': '🪐',
        'Chemistry': '⚗️',
        'Math & Logic': '➗',
        'Life Sciences': '🧬',
        'History': '📜',
        'Geography': '🌍',
        'Technology': '🤖',
        'Engineering & How Things Work': '🔧',
        'Fun Facts': '✨',
        'Space': '🚀',
        'Economics': '💸',
        'Psychology': '🧠',
        'News & Politics': '📰',
        'Other': '🌈',
        'not_educational': '🎭',
        'Art': '🎨',
        'Music': '🎵',
        'Language': '🗣️',
        'Philosophy': '💡',
        'Chemistry': '🧪',
        'Math': '➕',
        'Engineering': '⚙️',
        'Biology': '🦠',
        'Earth Science': '🌋',
        'Computer Science': '💻',
        'Astronomy': '🌠',
    };
    const getEmoji = (cat) => emojiMap[cat] || '🌱';

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
            <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}> 
                <Text style={[styles.loadingText, { color: theme.text }]}>Loading categories...</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* SolarPunk gradient background with organic curve */}
            <LinearGradient
                colors={[theme.gradientStart, theme.gradientEnd, theme.accent3]}
                style={styles.gradientBg}
                start={{ x: 0.1, y: 0.1 }}
                end={{ x: 1, y: 1 }}
            />
            {/* Glassy overlay curve */}
            <View style={styles.glassCurve} />
            {/* Floating mascot (leaf) */}
            <Text style={styles.mascot}>🍃</Text>
            <View style={styles.contentContainer}>
                <Text style={[styles.title, { color: theme.icon, textShadowColor: theme.accent4 }]}>Welcome! What are you interested in?</Text>
                <Text style={[styles.subtitle, { color: theme.accent2 }]}>
                    Pick a few topics to personalize your feed!
                </Text>
                <FlatList
                    data={categories}
                    keyExtractor={(item) => item}
                    renderItem={({ item }) => {
                        const isSelected = selectedCategories.includes(item);
                        return (
                            <TouchableOpacity
                                style={[styles.categoryItem, {
                                    backgroundColor: isSelected ? theme.accent3 : theme.surface,
                                    borderColor: isSelected ? theme.accent4 : theme.border,
                                    shadowColor: isSelected ? theme.accent4 : theme.shadow,
                                    transform: [{ scale: isSelected ? 1.07 : 1 }],
                                }]}
                                onPress={() => toggleCategory(item)}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.categoryEmoji, { textShadowColor: theme.accent4 }]}>{getEmoji(item)}</Text>
                                <Text style={[styles.categoryText, {
                                    color: isSelected ? theme.icon : theme.text,
                                    textShadowColor: isSelected ? theme.accent4 : 'transparent',
                                }]}
                                >{item}</Text>
                            </TouchableOpacity>
                        );
                    }}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.listContentContainer}
                />
                <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                        style={[styles.button, selectedCategories.length === 0 && styles.buttonDisabled, { backgroundColor: theme.accent4, shadowColor: theme.accent4 }]}
                        onPress={() => {
                            Animated.sequence([
                                Animated.spring(buttonScale, { toValue: 1.1, useNativeDriver: true }),
                                Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }),
                            ]).start(() => completeOnboarding());
                        }}
                        disabled={selectedCategories.length === 0}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={[theme.accent4, theme.accent, theme.accent2]}
                            style={styles.buttonGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Text style={styles.buttonText}>Let's Go!</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </View>
    );
}

// Define these constants outside the component so StyleSheet can access them
const { width } = Dimensions.get('window');
const itemWidth = (width - 60) / 2; // Calculate item width for 2 columns with padding

const styles = StyleSheet.create({
    gradientBg: {
        ...StyleSheet.absoluteFillObject,
        zIndex: -2,
    },
    glassCurve: {
        position: 'absolute',
        top: -80,
        left: -60,
        width: 400,
        height: 220,
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderBottomRightRadius: 200,
        borderBottomLeftRadius: 200,
        shadowColor: '#fff',
        shadowOpacity: 0.15,
        shadowRadius: 40,
        zIndex: -1,
    },
    mascot: {
        position: 'absolute',
        top: 38,
        right: 30,
        fontSize: 38,
        zIndex: 2,
        textShadowColor: '#A7F3D0',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 8,
    },
    contentContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        zIndex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 18,
        fontStyle: 'italic',
    },
    title: {
        fontSize: 30,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 8,
    },
    subtitle: {
        fontSize: 18,
        marginBottom: 30,
        textAlign: 'center',
        fontWeight: '600',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 4,
    },
    listContentContainer: {
        paddingBottom: 20,
    },
    row: {
        justifyContent: 'space-between',
        marginBottom: 18,
    },
    categoryItem: {
        width: itemWidth,
        paddingVertical: 28,
        paddingHorizontal: 15,
        borderRadius: 22,
        borderWidth: 2.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 6,
    },
    categoryEmoji: {
        fontSize: 32,
        marginBottom: 6,
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 6,
    },
    categoryText: {
        fontSize: 17,
        fontWeight: '700',
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    button: {
        borderRadius: 30,
        marginTop: 28,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
        elevation: 8,
    },
    buttonGradient: {
        paddingVertical: 16,
        paddingHorizontal: 60,
        borderRadius: 30,
        alignItems: 'center',
        width: '100%',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        letterSpacing: 1,
        textShadowColor: '#38BDF8',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 6,
    },
});