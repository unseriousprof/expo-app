// supabase.js
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Use only Constants.expoConfig.extra to get credentials for reliability across platforms
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;

// Throw an error if credentials are not found in app.json
if (!supabaseUrl) {
  throw new Error("Supabase URL is missing. Make sure it's set in your app.json extra section.");
}
if (!supabaseAnonKey) {
  throw new Error("Supabase Anon Key is missing. Make sure it's set in your app.json extra section.");
}

console.log("Supabase client initializing with URL:", supabaseUrl); // Add log to confirm URL

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    // Removed headers section for now to simplify debugging
    // headers: {
    //     'app.user_id': () => global.userId || '',
    // },
});

// Function to fetch unique onboarding categories
export async function getOnboardingCategories() {
    const { data, error } = await supabase
        .from('transcripts')
        .select('onboarding_categories')
        .limit(100);

    if (error) {
        console.error('Error fetching categories:', error);
        return [];
    }

    const categories = new Set();
    data.forEach(transcript => {
        if (transcript.onboarding_categories) {
            transcript.onboarding_categories.forEach(cat => {
                categories.add(cat.category);
            });
        }
    });
    return Array.from(categories);
}