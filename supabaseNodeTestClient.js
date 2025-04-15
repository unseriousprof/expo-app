import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is missing. Make sure it's set in your .env file.");
  // Throw an error because this script relies on .env
  throw new Error("Missing Supabase credentials in .env");
}

// Create the client specifically for this Node test environment
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    // Headers referencing global.userId are omitted as they might not work in Node
    // and may not be needed for fetching public categories.
});

// --- Copy of getOnboardingCategories from supabase.js ---
// Ensure it uses the 'supabase' client defined *above*
export async function getOnboardingCategories() {
    console.log("Using Node test client to fetch categories...");
    const { data, error } = await supabase // Uses the client from *this* file
        .from('transcripts')
        .select('onboarding_categories')
        .limit(100);

    if (error) {
        console.error('Error fetching categories:', error);
        return [];
    }

    const categories = new Set();
    data.forEach(transcript => {
        // Add checks for data structure validity
        if (transcript.onboarding_categories && Array.isArray(transcript.onboarding_categories)) { 
            transcript.onboarding_categories.forEach(cat => {
                if (cat && cat.category) {
                    categories.add(cat.category);
                } else {
                     console.warn("Found transcript with unexpected onboarding_categories structure (missing category property?):", transcript.id);
                }
            });
        } else if (transcript.onboarding_categories) {
            console.warn("Found transcript where onboarding_categories is not an array:", transcript.id);
        }
    });
    return Array.from(categories);
}
// --- End of copy --- 