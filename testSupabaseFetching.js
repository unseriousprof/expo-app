// testSupabaseFetching.js
// Removed dotenv import here as it's now handled in supabaseNodeTestClient.js

// Import from the Node-specific client file
import { getOnboardingCategories, supabase } from './supabaseNodeTestClient.js';

// Renamed original test function
async function testCategoryFetching() {
    console.log('\n--- Starting Supabase transcript category fetch test ---');

    try {
        const categories = await getOnboardingCategories(); // Uses the function from the imported client
        console.log('Fetched categories:', categories);

        if (categories && categories.length > 0) {
            console.log('Category Test PASSED: Successfully fetched categories.');
        } else {
            console.log('Category Test FAILED: No categories were fetched. Check Supabase connection, table data, or the getOnboardingCategories function.');

            // Add a more direct query for debugging if the first fails
            console.log('Attempting direct query to transcripts table for categories...');
            const { data, error } = await supabase // Uses the direct client
                .from('transcripts')
                .select('id, onboarding_categories')
                .limit(5);

            if (error) {
                console.error('Direct query error:', error);
            } else {
                console.log('Direct query data (first 5 rows):\n', JSON.stringify(data, null, 2));
                if (data && data.length > 0) {
                    console.log('Direct query suggests category data exists in the table.');
                } else {
                    console.log('Direct query confirms no category data found or accessible.');
                }
            }
        }
    } catch (error) {
        console.error('Category Test FAILED with error:', error);
    } finally {
        console.log('--- Category Test finished ---');
    }
}

// New test function for video fetching
async function testVideoFetching() {
    console.log('\n--- Starting Supabase video feed fetch test (Explicit Join Attempt) ---');
    try {
        const { data: videos, error } = await supabase
            .from('videos')
            // Attempting explicit join fetch using FK name
            .select(`
                *,
                transcripts:fk_transcripts_video_id (*)
            `)
            .eq('upload_status', 'done')
            .eq('transcribe_status', 'done')
            .eq('tag_status', 'done')
            .limit(5); // Limit for testing

        if (error) throw error;

        console.log(`Fetched ${videos.length} videos meeting status criteria.`);

        if (videos && videos.length > 0) {
            console.log('Video Test PASSED: Successfully fetched videos with explicit join attempt.');
            console.log('First video data sample (explicit join):\n', JSON.stringify(videos[0], null, 2));
            
            // Adjust check for the new structure: data might be under `transcripts` key which is an array
            const firstVideo = videos[0];
            if (firstVideo.transcripts && Array.isArray(firstVideo.transcripts) && firstVideo.transcripts.length > 0 && firstVideo.transcripts[0].onboarding_categories) {
                console.log('First video includes linked transcript category data (via explicit join).');
                console.log('Categories found:', JSON.stringify(firstVideo.transcripts[0].onboarding_categories));
            } else {
                console.warn('First video fetched does NOT include expected transcript category data structure (explicit join). Check relationships/query/data.');
                if (firstVideo.transcripts) {
                    console.log('Transcript data found:', JSON.stringify(firstVideo.transcripts));
                } else {
                    console.log('No transcript data found at all.');
                }
            }
        } else {
            console.log('Video Test FAILED: No videos meeting the status criteria were found (explicit join).');
        }
    } catch (error) {
        console.error('Video Test FAILED with error (explicit join):', error);
    } finally {
        console.log('--- Video Test finished (Explicit Join Attempt) ---');
    }
}

// Main function to run all tests
async function runAllTests() {
    await testCategoryFetching();
    await testVideoFetching();
}

runAllTests();

