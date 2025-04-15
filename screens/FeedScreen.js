// screens/FeedScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, FlatList, Text, StyleSheet, Dimensions, ActivityIndicator, Alert, TouchableOpacity, Pressable } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// --- VideoItem Component --- 
const VideoItem = React.memo(({ item, isActive }) => {
    const [isPaused, setIsPaused] = useState(false);
    const videoRef = useRef(null); // Ref to control video playback directly if needed

    const handlePress = () => {
        setIsPaused(prevState => !prevState);
    };

    // Effect to pause video if it becomes inactive
    useEffect(() => {
        if (!isActive) {
            setIsPaused(true); // Pause when not visible
        }
        // Optional: could also reset pause state when becoming active
        // else { 
        //    setIsPaused(false);
        // }
    }, [isActive]);

    return (
        <Pressable onPress={handlePress} style={styles.videoContainer}>
            <Video
                ref={videoRef}
                source={{ uri: item.video_file }}
                style={styles.video}
                // Use ResizeMode object
                resizeMode={ResizeMode.COVER} 
                isLooping
                // Play only if active and not manually paused
                shouldPlay={isActive && !isPaused} 
            />
            {isPaused && (
                <View style={styles.pauseIconContainer}>
                    <Ionicons name="play" size={80} color="rgba(255, 255, 255, 0.7)" />
                </View>
            )}
            <View style={styles.textOverlayContainer}> 
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.creator}>By {item.creator_username}</Text>
            </View>
        </Pressable>
    );
});
// --- End VideoItem Component ---

export default function FeedScreen({ navigation }) {
    const [videos, setVideos] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [viewableItemId, setViewableItemId] = useState(null);
    const [allLoaded, setAllLoaded] = useState(false);

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
    const BATCH_SIZE = 5;

    const fetchVideos = async (initialLoad = false) => {
        console.log(`fetchVideos called: initialLoad=${initialLoad}, loadingMore=${loadingMore}, allLoaded=${allLoaded}`); // Log entry
        if (!initialLoad && (loadingMore || allLoaded)) {
            console.log('fetchVideos: Skipping fetch (already loading or all loaded)');
            return;
        }

        if (initialLoad) {
            setLoading(true);
            setError(null);
            setAllLoaded(false);
        } else {
            setLoadingMore(true);
        }

        try {
            console.log('fetchVideos: Getting USER_ID and USER_CATEGORIES from AsyncStorage');
            const userId = await AsyncStorage.getItem('USER_ID');
            const cats = await AsyncStorage.getItem('USER_CATEGORIES');
            console.log(`fetchVideos: AsyncStorage results - userId=${userId}, cats=${cats}`);
            if (!userId) throw new Error('User ID not found in AsyncStorage');

            const userCategories = cats ? JSON.parse(cats) : [];
            if (initialLoad) {
                setSelectedCategories(userCategories);
                console.log('fetchVideos: User categories set:', userCategories);
            }

            const loadedVideoIds = videos.map(v => v.id);
            console.log('fetchVideos: Fetching from Supabase, excluding IDs:', loadedVideoIds);

            let query = supabase
                .from('videos')
                .select(`
                    *,
                    transcripts:fk_transcripts_video_id (*)
                `)
                .eq('upload_status', 'done')
                .eq('transcribe_status', 'done')
                .eq('tag_status', 'done');

            if (!initialLoad && loadedVideoIds.length > 0) {
                query = query.not('id', 'in', `(${loadedVideoIds.join(',')})`);
            }

            query = query.order('virality_score', { ascending: false }).limit(BATCH_SIZE);

            const { data, error: fetchError } = await query;

            if (fetchError) {
                console.error('fetchVideos: Supabase fetch error:', fetchError);
                throw fetchError;
            }
            
            console.log(`fetchVideos: Fetched ${initialLoad ? 'initial' : 'more'} videos (raw count):`, data?.length || 0);
            // console.log('fetchVideos: Raw data sample:', data?.slice(0, 2)); // Optional: Log first few raw items

            const filteredNewVideos = (data || []).filter(video => {
                const transcriptData = video.transcripts && Array.isArray(video.transcripts) && video.transcripts.length > 0
                    ? video.transcripts[0]
                    : null;
                if (!transcriptData || !transcriptData.onboarding_categories) return false;
                const videoCategories = transcriptData.onboarding_categories;
                return videoCategories.some(cat =>
                    userCategories.includes(cat.category) && cat.confidence > 0.7
                );
            });

            console.log('fetchVideos: Filtered new videos count:', filteredNewVideos.length);

            if (filteredNewVideos.length === 0 && data?.length === 0) {
                console.log('fetchVideos: Setting allLoaded = true (no data from Supabase)');
                setAllLoaded(true);
            } else {
                setVideos(prevVideos => {
                    const newVideos = initialLoad ? filteredNewVideos : [...prevVideos, ...filteredNewVideos];
                    console.log(`fetchVideos: Updating videos state. Total count: ${newVideos.length}`);
                    return newVideos;
                });
            }
            
            if (initialLoad && filteredNewVideos.length === 0 && !allLoaded) {
                console.log('fetchVideos: Setting error - No videos found matching interests (initial load)');
                setError('No videos found matching your interests. Try selecting different categories.');
            }
            if (data && data.length < BATCH_SIZE) {
                console.log('fetchVideos: Setting allLoaded = true (fetched less than BATCH_SIZE)');
                setAllLoaded(true);
            }

        } catch (err) {
            console.error('fetchVideos: Error caught:', err);
            setError(err.message || 'Failed to load videos');
        } finally {
            console.log('fetchVideos: Finally block running');
            if (initialLoad) {
                console.log('fetchVideos: Setting loading = false');
                setLoading(false);
            } else {
                console.log('fetchVideos: Setting loadingMore = false');
                setLoadingMore(false);
            }
        }
    };

    useEffect(() => {
        fetchVideos(true);
    }, []);

    const onViewableItemsChanged = useCallback(({ viewableItems }) => {
        if (viewableItems.length > 0) {
            setViewableItemId(viewableItems[0].item.id);
        } else {
            // Optionally set to null if no items are viewable, though usually one is
            // setViewableItemId(null);
        }
    }, []);

    // Use VideoItem in renderItem
    const renderVideoItem = useCallback(({ item }) => (
        <VideoItem 
            item={item} 
            isActive={item.id === viewableItemId} 
        />
    ), [viewableItemId]);

    const resetOnboarding = async () => {
        try {
            await AsyncStorage.setItem('ONBOARDED', 'false');
            navigation.replace('Onboarding');
        } catch (error) {
            console.error('Error resetting onboarding:', error);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>Loading your feed...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                    style={styles.resetButton}
                    onPress={resetOnboarding}
                >
                    <Text style={styles.resetButtonText}>Reset Onboarding</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (videos.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No videos found matching your interests.</Text>
                <Text style={styles.emptySubText}>Try selecting different categories in onboarding.</Text>
                <TouchableOpacity
                    style={styles.resetButton}
                    onPress={resetOnboarding}
                >
                    <Text style={styles.resetButtonText}>Reset Onboarding</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <StatusBar hidden />
            {/* Back Button */}
            <TouchableOpacity 
                style={styles.backButton}
                onPress={() => navigation.replace('Onboarding')} // Navigate back to Onboarding
            >
                <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
            <FlatList
                data={videos}
                keyExtractor={(item) => item.id}
                renderItem={renderVideoItem}
                snapToInterval={SCREEN_HEIGHT}
                snapToAlignment="start"
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                initialNumToRender={3}
                windowSize={5}
                maxToRenderPerBatch={3}
                onEndReached={() => fetchVideos(false)}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} size="large" color="#ccc" /> : null}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: '#666',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 20,
    },
    errorText: {
        fontSize: 16,
        color: '#ff3b30',
        textAlign: 'center',
        marginBottom: 10,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 20,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        textAlign: 'center',
        marginBottom: 10,
    },
    emptySubText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    videoContainer: {
        height: SCREEN_HEIGHT,
        alignItems: 'center',
        backgroundColor: '#000',
    },
    video: {
        width: '100%',
        height: SCREEN_HEIGHT,
    },
    title: {
        position: 'absolute',
        bottom: 60,
        left: 10,
        right: 10,
        color: '#fff',
        fontSize: 18,
        textAlign: 'left',
        paddingHorizontal: 10,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10
    },
    creator: {
        position: 'absolute',
        bottom: 40,
        left: 10,
        right: 10,
        color: '#ccc',
        fontSize: 14,
        textAlign: 'left',
        paddingHorizontal: 10,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10
    },
    resetButton: {
        marginTop: 20,
        backgroundColor: '#007AFF',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    resetButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    pauseIconContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.2)', // Slight dimming when paused
    },
    textOverlayContainer: { // New style for text overlay area
        position: 'absolute',
        bottom: 20, // Adjust positioning as needed
        left: 10,
        right: 10, 
        backgroundColor: 'rgba(0, 0, 0, 0.3)', // Optional background for readability
        padding: 8,
        borderRadius: 5,
    },
    backButton: { // Style for the back button
        position: 'absolute',
        top: 40, // Adjust as needed for status bar height / safe area
        left: 15,
        zIndex: 10, // Ensure it's above other elements
        padding: 5, // Add padding for easier tapping
        backgroundColor: 'rgba(0, 0, 0, 0.3)', // Optional background for visibility
        borderRadius: 15, // Make it roundish
    },
});