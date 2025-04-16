// screens/FeedScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, FlatList, Text, StyleSheet, Dimensions, ActivityIndicator, Alert, TouchableOpacity, Pressable, Modal, ScrollView } from 'react-native';
// import { Video, ResizeMode } from 'expo-av'; // Deprecated
import { VideoView, useVideoPlayer } from 'expo-video'; // Correct import for expo-video
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // Import hook
import { supabase } from '../supabase';
import { Colors } from '../constants/Colors';
import { useColorScheme } from '../hooks/useColorScheme';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// --- VideoItem Component --- 
const VideoItem = React.memo(({ item, isActive, onShowMetadata }) => {
    const [isManuallyPaused, setIsManuallyPaused] = useState(false);
    const insets = useSafeAreaInsets(); // Get safe area insets for this item
    
    // Create player using the hook
    const player = useVideoPlayer({ uri: item.video_file }, playerInstance => {
      playerInstance.loop = true;
      // Don't auto-play here, let the effect handle it based on isActive
    });

    const handlePress = () => {
        setIsManuallyPaused(prevState => {
            const newState = !prevState;
            if (newState) {
                player.pause(); // Manually pause
            } else {
                if (isActive) { // Only play if the item is active
                   player.play(); 
                }
            }
            return newState;
        });
    };

    // Effect to control playback based on isActive and manual pause state
    useEffect(() => {
        if (isActive && !isManuallyPaused) {
            player.play();
        } else {
            player.pause();
        }
    }, [isActive, isManuallyPaused, player]);

    // Cleanup the player when the component unmounts
    useEffect(() => {
        return () => {
            player.release();
        };
    }, [player]);

    return (
        <Pressable onPress={handlePress} style={styles.videoContainer}>
            {/* Replace Video with VideoView */}
            <VideoView
                player={player}
                style={styles.video}
                contentFit='cover'
                nativeControls={false} // Disable native controls
            />
            {isManuallyPaused && (
                <View style={styles.pauseIconContainer}>
                    <Ionicons name="play" size={80} color="rgba(255, 255, 255, 0.7)" />
                </View>
            )}
            <View style={[styles.textOverlayContainer, { bottom: insets.bottom + 20, left: insets.left + 10, right: insets.right + 10 }]}> 
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.creator}>By {item.creator_username}</Text>
                <TouchableOpacity style={styles.metadataButton} onPress={() => onShowMetadata(item)}>
                    <Ionicons name="information-circle-outline" size={28} color="#fff" />
                    <Text style={styles.metadataButtonText}>View Metadata</Text>
                </TouchableOpacity>
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
    const [metadataModalVisible, setMetadataModalVisible] = useState(false);
    const [metadataVideo, setMetadataVideo] = useState(null);

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
    const BATCH_SIZE = 15;
    const onEndReachedCalledDuringMomentum = useRef(true); // Ref to help debounce onEndReached
    const insets = useSafeAreaInsets(); // Get safe area insets for the screen
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme || 'light'];

    const fetchVideos = async (initialLoad = false) => {
        if (!initialLoad && (loadingMore || allLoaded)) {
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
            const userId = await AsyncStorage.getItem('USER_ID');
            const cats = await AsyncStorage.getItem('USER_CATEGORIES');
            if (!userId) throw new Error('User ID not found in AsyncStorage');

            const userCategories = cats ? JSON.parse(cats) : [];
            if (initialLoad) {
                setSelectedCategories(userCategories);
            }
            console.log('USER_CATEGORIES:', userCategories);

            // Step 1: Fetch videos (no join)
            const offset = videos.length;
            console.log('Requesting videos with offset:', offset, 'range:', offset, '-', offset + BATCH_SIZE - 1);
            let { data: videoBatch, error: videoError } = await supabase
                .from('videos')
                .select('*')
                .eq('upload_status', 'done')
                .eq('transcribe_status', 'done')
                .eq('tag_status', 'done')
                .order('virality_score', { ascending: false })
                .range(offset, offset + BATCH_SIZE - 1);
            if (videoError) throw videoError;
            if (!videoBatch || videoBatch.length === 0) {
                setAllLoaded(true);
                return;
            }
            console.log('Returned video IDs:', videoBatch.map(v => v.id));

            // Step 2: Fetch transcripts for those video IDs
            const videoIds = videoBatch.map(v => v.id);
            let { data: transcriptBatch, error: transcriptError } = await supabase
                .from('transcripts')
                .select('*')
                .in('video_id', videoIds);
            if (transcriptError) throw transcriptError;
            console.log('Fetched transcripts:', transcriptBatch.length);

            // Step 3: Merge transcripts into videos
            const transcriptMap = {};
            for (const t of transcriptBatch) {
                if (!transcriptMap[t.video_id]) transcriptMap[t.video_id] = [];
                transcriptMap[t.video_id].push(t);
            }
            // Filter: Only include videos where at least one onboarding_category matches user selection
            const filteredBatch = videoBatch.filter(v => {
                const transcripts = transcriptMap[v.id] || [];
                // Check all transcripts for onboarding_categories
                for (const t of transcripts) {
                    if (Array.isArray(t.onboarding_categories)) {
                        for (const cat of t.onboarding_categories) {
                            if (userCategories.includes(cat.category)) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            });
            const mergedBatch = filteredBatch.map(v => ({ ...v, transcripts: transcriptMap[v.id] || [] }));

            // Accumulate videos for infinite scroll
            setVideos(prev => initialLoad ? mergedBatch : [...prev, ...mergedBatch]);
            if (videoBatch.length < BATCH_SIZE) {
                setAllLoaded(true);
            }
        } catch (err) {
            console.error('fetchVideos: Error caught:', err);
            setError(err.message || 'Failed to load videos');
        } finally {
            if (initialLoad) {
                setLoading(false);
            } else {
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

    const handleShowMetadata = (video) => {
        setMetadataVideo(video);
        setMetadataModalVisible(true);
    };

    const handleCloseMetadata = () => {
        setMetadataModalVisible(false);
        setMetadataVideo(null);
    };

    // Use VideoItem in renderItem
    const renderVideoItem = useCallback(({ item }) => (
        <VideoItem 
            item={item} 
            isActive={item.id === viewableItemId} 
            onShowMetadata={handleShowMetadata}
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

    if (videos.length === 0 && !loading) { // Check loading state too
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
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* SolarPunk gradient background */}
            <View style={{
                ...StyleSheet.absoluteFillObject,
                zIndex: -1,
                backgroundColor: theme.background,
            }}>
                {/* Gradient layer */}
                <View style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    borderBottomLeftRadius: 80,
                    borderBottomRightRadius: 80,
                    overflow: 'hidden',
                }}>
                    <View style={{
                        flex: 1,
                        backgroundColor: 'transparent',
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                    }}>
                        {/* Simulated gradient using two overlapping views */}
                        <View style={{
                            position: 'absolute',
                            width: '100%',
                            height: '60%',
                            backgroundColor: theme.gradientStart,
                            opacity: 0.7,
                            borderBottomLeftRadius: 80,
                            borderBottomRightRadius: 80,
                        }} />
                        <View style={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            backgroundColor: theme.gradientEnd,
                            opacity: 0.25,
                        }} />
                    </View>
                </View>
            </View>
            <StatusBar hidden />
            {/* Adjust Back Button position using insets */}
            <TouchableOpacity 
                style={[styles.backButton, {
                    top: insets.top + 10, left: insets.left + 15,
                    backgroundColor: theme.overlay,
                    shadowColor: theme.shadow,
                }]} // Apply insets and theme
                onPress={() => navigation.replace('Onboarding')} // Navigate back to Onboarding
            >
                <Ionicons name="arrow-back" size={28} color={theme.icon} />
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
                initialNumToRender={5} // Increased
                windowSize={10} // Increased
                maxToRenderPerBatch={5} // Increased
                onEndReached={() => {
                    if (!onEndReachedCalledDuringMomentum.current && !loadingMore) {
                        fetchVideos(false);
                        onEndReachedCalledDuringMomentum.current = true; 
                    }
                }}
                onEndReachedThreshold={0.8}
                onMomentumScrollBegin={() => { onEndReachedCalledDuringMomentum.current = false; }} 
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} size="large" color={theme.accent4} /> : null}
            />
            {/* Metadata Modal */}
            <Modal
                visible={metadataModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={handleCloseMetadata}
            >
                <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}> {/* Glassy overlay */}
                    <View style={[styles.modalContainer, {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        shadowColor: theme.shadow,
                        borderWidth: 2,
                        // Neon glow effect
                        shadowOpacity: 0.7,
                        shadowRadius: 24,
                        elevation: 16,
                    }]}
                    >
                        <ScrollView contentContainerStyle={styles.modalScrollContent}>
                            <Text style={[styles.modalTitle, { color: theme.icon }]}>Video Metadata</Text>
                            {metadataVideo && (
                                <>
                                    <Text style={[styles.modalSectionTitle, { color: theme.accent2 }]}>General</Text>
                                    <Text style={styles.modalLabel}>TikTok ID: <Text style={styles.modalValue}>{metadataVideo.tiktok_id}</Text></Text>
                                    <Text style={styles.modalLabel}>Upload Date: <Text style={styles.modalValue}>{metadataVideo.upload_date}</Text></Text>
                                    <Text style={styles.modalLabel}>Views: <Text style={styles.modalValue}>{metadataVideo.views}</Text></Text>
                                    <Text style={styles.modalLabel}>Likes: <Text style={styles.modalValue}>{metadataVideo.likes}</Text></Text>
                                    <Text style={styles.modalLabel}>Comments: <Text style={styles.modalValue}>{metadataVideo.comments}</Text></Text>
                                    <Text style={styles.modalLabel}>Duration: <Text style={styles.modalValue}>{metadataVideo.duration}s</Text></Text>
                                    <Text style={styles.modalLabel}>Resolution: <Text style={styles.modalValue}>{metadataVideo.resolution}</Text></Text>
                                    <Text style={styles.modalLabel}>Language: <Text style={styles.modalValue}>{metadataVideo.language}</Text></Text>
                                    <Text style={styles.modalLabel}>Description: <Text style={styles.modalValue}>{metadataVideo.transcripts?.[0]?.description || ''}</Text></Text>
                                    <Text style={[styles.modalSectionTitle, { color: theme.accent4 }]}>Tagging Output</Text>
                                    <Text style={styles.modalLabel}>Categories: {Array.isArray(metadataVideo.transcripts?.[0]?.categories) ? metadataVideo.transcripts[0].categories.map((c, i) => <Text key={i} style={styles.modalValue}>{c.tag}{i < metadataVideo.transcripts[0].categories.length - 1 ? ', ' : ''}</Text>) : <Text style={styles.modalValue}>N/A</Text>}</Text>
                                    <Text style={styles.modalLabel}>Topics: {Array.isArray(metadataVideo.transcripts?.[0]?.topics) ? metadataVideo.transcripts[0].topics.map((t, i) => <Text key={i} style={styles.modalValue}>{t.topic}{i < metadataVideo.transcripts[0].topics.length - 1 ? ', ' : ''}</Text>) : <Text style={styles.modalValue}>N/A</Text>}</Text>
                                    <Text style={styles.modalLabel}>Difficulty Level: <Text style={styles.modalValue}>{metadataVideo.transcripts?.[0]?.difficulty_level?.level || ''}</Text></Text>
                                    <Text style={styles.modalLabel}>Predictive Engagement:</Text>
                                    <View style={styles.modalSubSection}>
                                        <Text style={styles.modalLabel}>Educational Value: <Text style={styles.modalValue}>{metadataVideo.transcripts?.[0]?.predictive_engagement?.educational_value ?? ''}</Text></Text>
                                        <Text style={styles.modalLabel}>Attention Grabbing: <Text style={styles.modalValue}>{metadataVideo.transcripts?.[0]?.predictive_engagement?.attention_grabbing ?? ''}</Text></Text>
                                        <Text style={styles.modalLabel}>Entertainment Value: <Text style={styles.modalValue}>{metadataVideo.transcripts?.[0]?.predictive_engagement?.entertainment_value ?? ''}</Text></Text>
                                    </View>
                                    <Text style={styles.modalLabel}>Content Flags: {Array.isArray(metadataVideo.transcripts?.[0]?.content_flags) ? metadataVideo.transcripts[0].content_flags.map((c, i) => <Text key={i} style={styles.modalValue}>{c}{i < metadataVideo.transcripts[0].content_flags.length - 1 ? ', ' : ''}</Text>) : <Text style={styles.modalValue}>N/A</Text>}</Text>
                                </>
                            )}
                            <TouchableOpacity style={[styles.modalCloseButton, { backgroundColor: theme.accent3 }]} onPress={handleCloseMetadata}>
                                <Ionicons name="close-circle" size={32} color={theme.accent4} />
                                <Text style={[styles.modalCloseButtonText, { color: theme.icon }]}>Close</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
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
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'left',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
        marginBottom: 4,
    },
    creator: {
        color: '#ccc',
        fontSize: 14,
        textAlign: 'left',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
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
    textOverlayContainer: { 
        position: 'absolute',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
    },
    backButton: { 
        position: 'absolute',
        zIndex: 10, 
        padding: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 20,
    },
    metadataButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(110, 231, 183, 0.85)', // SolarPunk mint green
        borderRadius: 20,
        paddingVertical: 6,
        paddingHorizontal: 14,
        alignSelf: 'flex-end',
        marginTop: 8,
        shadowColor: '#6ee7b7',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    metadataButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        marginLeft: 6,
        fontSize: 16,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(34, 197, 94, 0.18)', // SolarPunk green overlay
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: '90%',
        maxHeight: '85%',
        backgroundColor: '#f0fdf4', // SolarPunk light mint
        borderRadius: 24,
        padding: 20,
        shadowColor: '#6ee7b7',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
    },
    modalScrollContent: {
        paddingBottom: 30,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#059669', // SolarPunk deep green
        marginBottom: 10,
        textAlign: 'center',
    },
    modalSectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#10b981',
        marginTop: 16,
        marginBottom: 4,
    },
    modalLabel: {
        fontSize: 15,
        color: '#047857',
        marginTop: 6,
        fontWeight: '600',
    },
    modalValue: {
        color: '#334155',
        fontWeight: '400',
    },
    modalSubSection: {
        marginLeft: 12,
        marginBottom: 6,
    },
    modalCloseButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        marginTop: 18,
        backgroundColor: '#d1fae5',
        borderRadius: 16,
        paddingVertical: 8,
        paddingHorizontal: 18,
    },
    modalCloseButtonText: {
        color: '#059669',
        fontWeight: 'bold',
        fontSize: 16,
        marginLeft: 8,
    },
});