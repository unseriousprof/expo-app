import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import FeedScreen from '../screens/FeedScreen';

// Mock the external dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../supabase', () => ({
    supabase: {
        from: jest.fn(),
    },
}));
jest.mock('expo-video', () => ({
    VideoView: 'VideoView',
    useVideoPlayer: () => ({
        play: jest.fn(),
        pause: jest.fn(),
        release: jest.fn(),
        loop: false,
    }),
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('FeedScreen', () => {
    // Sample test data
    const mockVideos = [
        {
            id: '1',
            title: 'Test Video 1',
            creator_username: 'creator1',
            video_file: 'http://example.com/video1.mp4',
            upload_status: 'done',
            transcribe_status: 'done',
            tag_status: 'done',
            transcripts: [{
                onboarding_categories: [
                    { category: 'news & politics', confidence: 0.8 }
                ]
            }]
        },
        {
            id: '2',
            title: 'Test Video 2',
            creator_username: 'creator2',
            video_file: 'http://example.com/video2.mp4',
            upload_status: 'done',
            transcribe_status: 'done',
            tag_status: 'done',
            transcripts: [{
                onboarding_categories: [
                    { category: 'entertainment', confidence: 0.9 }
                ]
            }]
        }
    ];

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Setup AsyncStorage mock returns
        AsyncStorage.getItem.mockImplementation((key) => {
            switch (key) {
                case 'USER_ID':
                    return Promise.resolve('test-user-id');
                case 'USER_CATEGORIES':
                    return Promise.resolve(JSON.stringify(['news & politics', 'entertainment']));
                default:
                    return Promise.resolve(null);
            }
        });

        // Setup Supabase mock returns
        const mockSupabaseQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnValue(Promise.resolve({ data: mockVideos }))
        };
        supabase.from.mockReturnValue(mockSupabaseQuery);
    });

    it('should fetch and filter videos based on user categories', async () => {
        let component;
        await act(async () => {
            component = render(<FeedScreen navigation={{ replace: jest.fn() }} />);
        });

        // Wait for initial data fetch
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        // Verify AsyncStorage was called correctly
        expect(AsyncStorage.getItem).toHaveBeenCalledWith('USER_ID');
        expect(AsyncStorage.getItem).toHaveBeenCalledWith('USER_CATEGORIES');

        // Verify Supabase query was constructed correctly
        expect(supabase.from).toHaveBeenCalledWith('videos');

        // Check if videos are rendered
        const videoElements = component.getAllByTestId('video-item');
        expect(videoElements).toHaveLength(2);
    });

    it('should handle empty video response correctly', async () => {
        // Mock empty response from Supabase
        const mockEmptyQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnValue(Promise.resolve({ data: [] }))
        };
        supabase.from.mockReturnValue(mockEmptyQuery);

        let component;
        await act(async () => {
            component = render(<FeedScreen navigation={{ replace: jest.fn() }} />);
        });

        // Wait for initial data fetch
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        // Should show empty state message
        expect(component.getByText('No videos found matching your interests.')).toBeTruthy();
    });

    it('should filter videos by category confidence threshold', async () => {
        const mockVideosWithLowConfidence = [
            {
                ...mockVideos[0],
                transcripts: [{
                    onboarding_categories: [
                        { category: 'news & politics', confidence: 0.6 } // Below threshold
                    ]
                }]
            }
        ];

        const mockQueryLowConfidence = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnValue(Promise.resolve({ data: mockVideosWithLowConfidence }))
        };
        supabase.from.mockReturnValue(mockQueryLowConfidence);

        let component;
        await act(async () => {
            component = render(<FeedScreen navigation={{ replace: jest.fn() }} />);
        });

        // Wait for initial data fetch
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        // Should show empty state because all videos were filtered out due to low confidence
        expect(component.getByText('No videos found matching your interests.')).toBeTruthy();
    });
}); 